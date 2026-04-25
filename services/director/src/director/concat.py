"""ffmpeg concat-demuxer master assembly.

Pipeline:
  1. For each Step in order, locate its cached clip (.mp4) and narration (.mp3).
  2. Mux narration onto each clip → segment .mp4 (audio + video, fixed codec).
  3. Concat-demux the segments into master.mp4 with `-c copy` so unchanged
     segments are byte-identical across takes.

Why per-step muxing-then-concat:
  Concat-demuxer requires identical stream layouts in every input. Muxing
  audio+video together once per step gives us a uniform .mp4 with both
  streams. The master pass then never re-encodes — segments are stitched at
  the container level, preserving every byte of unchanged steps.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

from .atomic_io import write_json_atomic, write_text_atomic
from .logfire_setup import span
from .models import (
    StepDiff,
    StepStatus,
    Take,
    TakeStatus,
    Walkthrough,
    step_artifact_paths,
    take_dir,
)

# Pinned encode params used everywhere a clip is created. Identical params +
# identical input = byte-identical output. Don't tweak without bumping a
# version marker — every cached clip would invalidate.
ENCODE_ARGS = [
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-g", "60",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-movflags", "+faststart",
]


def _ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-y", *args], capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed:\n" + proc.stderr.decode("utf-8", errors="replace")[-1500:]
        )


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _copy_bytes(src: Path, dst: Path) -> None:
    """Byte-for-byte copy. Preserves SHA-256 (the whole point of segment reuse)."""
    dst.write_bytes(src.read_bytes())


def _build_segment(clip: Path, narration: Path | None, dst: Path, duration_ms: int) -> None:
    """Mux narration onto a clip, padding to the step's declared duration."""
    duration_s = duration_ms / 1000.0
    if narration and narration.exists():
        # Video silent → drop original audio (-an on the input below would also work).
        # Pad narration with silence to step duration so audio and video align.
        args = [
            "-i", str(clip),
            "-i", str(narration),
            "-filter_complex",
            f"[1:a]apad,atrim=0:{duration_s:.3f},asetpts=N/SR/TB[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-shortest",
            *ENCODE_ARGS,
            str(dst),
        ]
    else:
        args = [
            "-i", str(clip),
            "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo",
            "-map", "0:v",
            "-map", "1:a",
            "-shortest",
            *ENCODE_ARGS,
            str(dst),
        ]
    _ffmpeg(args)


def assemble_master(
    walkthrough: Walkthrough,
    walkthroughs_dir: Path,
    take_id: str = "master",
    *,
    step_diffs: list[StepDiff] | None = None,
    parent_take_id: str | None = None,
    pr_number: int | None = None,
    pr_title: str | None = None,
    director_note: str | None = None,
    status: TakeStatus = TakeStatus.READY,
) -> dict:
    """Assemble a master.mp4 from cached step artifacts. Returns the manifest dict."""
    out_dir = take_dir(walkthroughs_dir, walkthrough.id, take_id)
    segments_dir = out_dir / "segments"
    segments_dir.mkdir(parents=True, exist_ok=True)
    master_path = out_dir / "master.mp4"

    # Continuous-narration mode: when a director synth-continuous run has
    # produced narration.mp3 at the walkthrough root, prefer it over the
    # per-step mp3s. We build silent-video segments, concatenate, and then
    # mix the single continuous take onto the assembled video. Segment
    # reuse from a parent take is disabled here because parent segments
    # carry per-step audio that doesn't match silent-video segments.
    continuous_mp3 = walkthroughs_dir / walkthrough.id / "narration.mp3"
    use_continuous = continuous_mp3.exists() and continuous_mp3.stat().st_size > 0

    # For non-master takes, reuse the parent's segments byte-for-byte for any
    # step the agent classified UNCHANGED. This is what makes the byte-identity
    # claim hold — parent-take segments are immutable; we never re-encode them.
    reuse_from_parent: dict[str, Path] = {}
    if step_diffs is not None and parent_take_id is not None and not use_continuous:
        parent = take_dir(walkthroughs_dir, walkthrough.id, parent_take_id)
        parent_segments = parent / "segments"
        unchanged_ids = {d.step_id for d in step_diffs if d.status is StepStatus.UNCHANGED}
        for sid in unchanged_ids:
            candidate = parent_segments / f"{sid}.mp4"
            if candidate.exists():
                reuse_from_parent[sid] = candidate

    with span(
        "concat.assemble_master",
        walkthrough_id=walkthrough.id,
        take_id=take_id,
        steps=len(walkthrough.steps),
        reused=len(reuse_from_parent),
    ):
        segment_entries: list[dict] = []
        concat_lines: list[str] = []

        for step in walkthrough.steps:
            seg_path = segments_dir / f"{step.id}.mp4"

            if step.id in reuse_from_parent:
                _copy_bytes(reuse_from_parent[step.id], seg_path)
                source = "reused"
            else:
                paths = step_artifact_paths(walkthroughs_dir, walkthrough.id, step.id)
                if not paths["clip"].exists():
                    raise FileNotFoundError(
                        f"missing clip for step {step.id}: {paths['clip']} — run `director ingest` first"
                    )
                # In continuous mode, segments carry only video — the joined
                # narration is mixed onto the assembled master in one pass.
                narration_arg = None if use_continuous else paths["narration"]
                _build_segment(paths["clip"], narration_arg, seg_path, step.duration_ms)
                source = "rebuilt"

            seg_sha = _file_sha256(seg_path)
            segment_entries.append(
                {
                    "step_id": step.id,
                    "fingerprint": step.fingerprint(),
                    "segment_path": str(seg_path.relative_to(out_dir)),
                    "segment_sha256": seg_sha,
                    "duration_ms": step.duration_ms,
                    "source": source,
                }
            )
            concat_lines.append(f"file '{seg_path.name}'")

        concat_list = segments_dir / "concat.txt"
        write_text_atomic(concat_list, "\n".join(concat_lines) + "\n")

        if use_continuous:
            # Concat silent-video segments to a temp file, then mix the
            # continuous narration as the master's audio track in a single
            # encode pass. The result is one mp4 with one audio stream.
            silent_master = segments_dir / "_silent_master.mp4"
            _ffmpeg([
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy",
                str(silent_master),
            ])
            _ffmpeg([
                "-i", str(silent_master),
                "-i", str(continuous_mp3),
                "-map", "0:v",
                "-map", "1:a",
                "-shortest",
                *ENCODE_ARGS,
                "-movflags", "+faststart",
                str(master_path),
            ])
            silent_master.unlink(missing_ok=True)
        else:
            _ffmpeg([
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy",
                "-movflags", "+faststart",
                str(master_path),
            ])

    manifest = {
        "walkthrough_id": walkthrough.id,
        "take_id": take_id,
        "master_path": str(master_path.relative_to(out_dir)),
        "master_sha256": _file_sha256(master_path),
        "segments": segment_entries,
    }
    write_json_atomic(out_dir / "manifest.json", manifest)

    # Write the Take record for the cutroom. Default: every existing step is
    # UNCHANGED — the initial master, or a re-bake of unchanged content.
    if step_diffs is None:
        step_diffs = [
            StepDiff(
                step_id=s.id,
                status=StepStatus.UNCHANGED,
                reason="initial master",
            )
            for s in walkthrough.steps
        ]
    take = Take(
        id=take_id,
        walkthrough_id=walkthrough.id,
        parent_take_id=parent_take_id,
        pr_number=pr_number,
        pr_title=pr_title,
        director_note=director_note,
        status=status,
        step_diffs=step_diffs,
        master_path=manifest["master_path"],
    )
    write_text_atomic(out_dir / "take.json", take.model_dump_json(indent=2))
    return manifest


def diff_takes(walkthroughs_dir: Path, walkthrough_id: str, take_a: str, take_b: str) -> list[dict]:
    """Compare segment hashes between two takes. Used by the cutroom side-by-side."""
    a = take_dir(walkthroughs_dir, walkthrough_id, take_a) / "manifest.json"
    b = take_dir(walkthroughs_dir, walkthrough_id, take_b) / "manifest.json"
    ma = json.loads(a.read_text())
    mb = json.loads(b.read_text())

    by_id_a = {s["step_id"]: s for s in ma["segments"]}
    by_id_b = {s["step_id"]: s for s in mb["segments"]}
    rows = []
    for sid in dict.fromkeys([*by_id_a, *by_id_b]):
        sa = by_id_a.get(sid)
        sb = by_id_b.get(sid)
        if sa and sb:
            identical = sa["segment_sha256"] == sb["segment_sha256"]
            rows.append({"step_id": sid, "identical": identical, "a": sa, "b": sb})
        elif sa:
            rows.append({"step_id": sid, "identical": False, "a": sa, "b": None})
        else:
            rows.append({"step_id": sid, "identical": False, "a": None, "b": sb})
    return rows


__all__ = ["ENCODE_ARGS", "assemble_master", "diff_takes"]

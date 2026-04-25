"""Compose a richer master.mp4 from existing pieces.

Takes the canonical master clip and prepends an intro / appends an outro
PNG (each rendered as a 3s clip with a fade), then concat-demuxes the
three pieces into a new master.mp4. Updates the take's manifest.json.

Use case: the demo video at /takes/master gains real bookends without
any Playwright re-capture.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from .atomic_io import write_text_atomic
from .concat import ENCODE_ARGS
from .logfire_setup import span


def _ffmpeg(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-y", *args], capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(
            "ffmpeg failed:\n" + proc.stderr.decode("utf-8", errors="replace")[-1500:]
        )


def _png_to_clip(png_path: Path, out_path: Path, duration_s: float, fade_s: float = 0.6) -> None:
    """Encode a PNG as a 3s clip with fade-in + fade-out and silent audio.

    Uses the same codec params as the rest of the pipeline so the concat
    step doesn't need to re-encode."""
    fade_out_start = max(0.0, duration_s - fade_s)
    args = [
        "-loop", "1",
        "-t", f"{duration_s:.3f}",
        "-i", str(png_path),
        "-f", "lavfi",
        "-t", f"{duration_s:.3f}",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf",
        (
            "scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fade=t=in:st=0:d={fade_s:.3f},"
            f"fade=t=out:st={fade_out_start:.3f}:d={fade_s:.3f}"
        ),
        "-shortest",
        *ENCODE_ARGS,
        str(out_path),
    ]
    _ffmpeg(args)


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def bake_master(
    walkthroughs_dir: Path,
    walkthrough_id: str,
    intro_png: Path | None = None,
    outro_png: Path | None = None,
    intro_duration_s: float = 3.0,
    outro_duration_s: float = 3.0,
    take_id: str = "master",
) -> dict:
    """Bake intro/outro PNG bookends into the take's master.mp4."""
    take_dir = walkthroughs_dir / walkthrough_id / "takes" / take_id
    master_path = take_dir / "master.mp4"
    if not master_path.exists():
        raise FileNotFoundError(f"missing {master_path}; run `director master` first")

    work = take_dir / ".bake-tmp"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    inputs: list[Path] = []
    with span("bake_master.compose", walkthrough_id=walkthrough_id, take_id=take_id):
        if intro_png is not None:
            intro_clip = work / "intro.mp4"
            _png_to_clip(intro_png, intro_clip, intro_duration_s)
            inputs.append(intro_clip)

        # Re-encode the existing master with fade-in/out at the seams so the
        # transition into/out of the bookends is smooth.
        body_clip = work / "body.mp4"
        body_args = [
            "-i", str(master_path),
            "-vf",
            (
                f"fade=t=in:st=0:d=0.4,"
                f"fade=t=out:st=ignore:d=0.4"
            ).replace("fade=t=out:st=ignore:d=0.4", ""),
            "-c:a", "aac",
            *ENCODE_ARGS,
            str(body_clip),
        ]
        # Simpler: just copy with re-encode using shared codec params (no fade)
        # so the concat doesn't introduce timing weirdness.
        body_args = [
            "-i", str(master_path),
            *ENCODE_ARGS,
            str(body_clip),
        ]
        _ffmpeg(body_args)
        inputs.append(body_clip)

        if outro_png is not None:
            outro_clip = work / "outro.mp4"
            _png_to_clip(outro_png, outro_clip, outro_duration_s)
            inputs.append(outro_clip)

        # Backup the existing master before overwriting.
        backup = take_dir / "master.before-bake.mp4"
        if not backup.exists():
            shutil.copy2(master_path, backup)

        concat_list = work / "concat.txt"
        write_text_atomic(concat_list, "\n".join(f"file '{p.name}'" for p in inputs) + "\n")

        new_master = work / "master.mp4"
        _ffmpeg([
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list),
            "-c", "copy",
            "-movflags", "+faststart",
            str(new_master),
        ])

        # Replace the take's master.mp4 with the baked version.
        shutil.move(new_master, master_path)

    new_sha = _file_sha256(master_path)
    manifest_path = take_dir / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        manifest["master_sha256"] = new_sha
        manifest["baked"] = {
            "intro_png": str(intro_png) if intro_png else None,
            "outro_png": str(outro_png) if outro_png else None,
            "intro_duration_s": intro_duration_s if intro_png else None,
            "outro_duration_s": outro_duration_s if outro_png else None,
        }
        write_text_atomic(manifest_path, json.dumps(manifest, indent=2))

    shutil.rmtree(work, ignore_errors=True)
    return {
        "master_path": str(master_path),
        "master_sha256": new_sha,
    }


__all__ = ["bake_master"]

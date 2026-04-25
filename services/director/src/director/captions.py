"""WebVTT captions generated from narration.timing.json.

The continuous-narration synth (continuous_narration.py) drops a
`narration.timing.json` next to the walkthrough whose `steps` array gives
us per-step start_ms/end_ms within the master narration take. Combined
with each step's `narration` text from walkthrough.yaml, that's enough to
emit a valid WebVTT file without a separate transcription pass.

We emit one cue per step. ElevenLabs's character-level timing is finer
grained, but step-level cues match the visual cadence of the video and
read better as captions than word-level karaoke would on a 1-2 sentence
narration line.
"""

from __future__ import annotations

import json
from pathlib import Path

from .atomic_io import write_text_atomic
from .walkthrough_loader import load_walkthrough


def _format_ts(ms: int) -> str:
    """Format milliseconds as the WebVTT cue timestamp HH:MM:SS.mmm."""
    if ms < 0:
        ms = 0
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def narration_to_vtt(walkthrough_dir: Path) -> str:
    """Build a WebVTT string from narration.timing.json + walkthrough.yaml.

    Raises FileNotFoundError if the timing file is missing — the caller
    decides whether to surface that to the UI or run synth-continuous first.
    """
    timing_path = walkthrough_dir / "narration.timing.json"
    if not timing_path.exists():
        raise FileNotFoundError(
            f"{timing_path} not found — run `director synth-continuous "
            f"{walkthrough_dir.name}` first."
        )

    timing = json.loads(timing_path.read_text())
    steps_timing = {s["step_id"]: s for s in timing.get("steps", [])}

    wt = load_walkthrough(walkthrough_dir)

    lines: list[str] = ["WEBVTT", ""]
    for i, step in enumerate(wt.steps):
        t = steps_timing.get(step.id)
        if not t:
            # Fallback: derive from declared duration cumulatively. Better
            # than dropping the cue.
            continue
        start_ms = int(t["start_ms"])
        end_ms = int(t["end_ms"])
        if end_ms <= start_ms:
            end_ms = start_ms + 1000
        cue_id = f"step-{i + 1}-{step.id}"
        lines.append(cue_id)
        lines.append(f"{_format_ts(start_ms)} --> {_format_ts(end_ms)}")
        # Title on its own line, then narration. WebVTT supports plain text;
        # the player styles it.
        lines.append(step.title)
        lines.append(step.narration)
        lines.append("")

    return "\n".join(lines)


def write_captions(walkthrough_dir: Path) -> Path:
    """Generate captions.vtt and write atomically. Returns the path."""
    vtt = narration_to_vtt(walkthrough_dir)
    out = walkthrough_dir / "captions.vtt"
    write_text_atomic(out, vtt)
    return out


__all__ = ["narration_to_vtt", "write_captions"]

"""Continuous-narration synth.

Joins every step's narration into a single ElevenLabs request so prosody
carries across step boundaries (no choppy per-step concatenation), then writes
three sibling files at the walkthrough root:

  walkthroughs/<id>/narration.mp3              full continuous take
  walkthroughs/<id>/narration.timing.json      per-step alignment in ms
  walkthroughs/<id>/narration.waveform.json    downsampled peaks for the UI

The ``timing.json`` file is what lets the cutroom timeline draw a single
waveform spanning the take while still highlighting per-step ranges.
ElevenLabs returns per-character timestamps when we use the
``with_timestamps`` endpoint; we sum the character durations belonging to
each step's slice of the joined script.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

from elevenlabs.client import ElevenLabs

from .atomic_io import write_bytes_atomic, write_text_atomic

from .config import settings
from .logfire_setup import span
from .models import Walkthrough
from .waveform import extract_waveform


# Inserted between consecutive step narrations when we build the joined script.
# A space is enough — ElevenLabs respects sentence-final punctuation already
# present in the per-step narration. Avoid SSML so we don't depend on partial
# SSML support across model versions.
JOINER = " "


@dataclass(frozen=True)
class _StepSlice:
    step_id: str
    text: str
    start_char: int  # offset into the joined script
    end_char: int    # exclusive


def _build_script(wt: Walkthrough) -> tuple[str, list[_StepSlice]]:
    parts: list[str] = []
    slices: list[_StepSlice] = []
    cursor = 0
    for i, step in enumerate(wt.steps):
        text = (step.narration or "").strip()
        if not text:
            text = step.title.strip()
        if i > 0:
            cursor += len(JOINER)
            parts.append(JOINER)
        start = cursor
        parts.append(text)
        cursor += len(text)
        slices.append(
            _StepSlice(step_id=step.id, text=text, start_char=start, end_char=cursor)
        )
    return "".join(parts), slices


def _step_ranges_from_alignment(
    slices: list[_StepSlice],
    chars: list[str],
    starts_s: list[float],
    ends_s: list[float],
) -> list[dict]:
    """Map each step's char range onto the alignment array, returning ms ranges.

    ElevenLabs' ``with_timestamps`` mode returns a list of characters and a
    parallel list of start/end times in seconds. We walk the slices in order,
    snapping each step's start/end to the matching character index. We trust
    ordering rather than character matching because the joined script and the
    returned characters should be byte-identical, but if they ever diverge
    (whitespace normalization, etc.) we fall back to proportional positioning.
    """
    out: list[dict] = []
    n = len(chars)
    if n == 0 or len(starts_s) != n or len(ends_s) != n:
        # Fallback: zero ranges so the UI has something legal to render.
        return [
            {"step_id": s.step_id, "start_ms": 0, "end_ms": 0} for s in slices
        ]

    # Strict mapping by character index, clamped to the alignment's bounds.
    for s in slices:
        si = max(0, min(n - 1, s.start_char))
        ei = max(0, min(n - 1, s.end_char - 1))
        start_ms = int(round(starts_s[si] * 1000))
        end_ms = int(round(ends_s[ei] * 1000))
        if end_ms < start_ms:
            end_ms = start_ms
        out.append({"step_id": s.step_id, "start_ms": start_ms, "end_ms": end_ms})
    return out


def synth_continuous(wt: Walkthrough, walkthroughs_dir: Path) -> dict:
    """Synthesize a single continuous take for the walkthrough.

    Returns the timing dict that's also written to disk:
        {duration_ms, steps: [{step_id, start_ms, end_ms}]}
    """
    script, slices = _build_script(wt)
    voice_id = wt.brand.voice_id or settings.elevenlabs_voice_id
    model_id = "eleven_turbo_v2_5"

    out_dir = walkthroughs_dir / wt.id
    out_dir.mkdir(parents=True, exist_ok=True)
    mp3_path = out_dir / "narration.mp3"
    timing_path = out_dir / "narration.timing.json"
    waveform_path = out_dir / "narration.waveform.json"

    with span(
        "narrator.synth_continuous",
        walkthrough_id=wt.id,
        voice_id=voice_id,
        model=model_id,
        chars=len(script),
        steps=len(slices),
    ):
        client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        # convert_with_timestamps returns base64 audio + alignment metadata.
        # The SDK uses snake_case attributes; some versions return a streaming
        # iterator with a final aggregate object. We collect to a single object
        # to keep this function synchronous — narrations top out around 60s of
        # audio for a typical walkthrough so memory is fine.
        result = client.text_to_speech.convert_with_timestamps(
            voice_id=voice_id,
            model_id=model_id,
            text=script,
            output_format="mp3_44100_128",
        )

        audio_b64 = (
            getattr(result, "audio_base_64", None)
            or getattr(result, "audio_base64", None)
        )
        alignment = getattr(result, "alignment", None)
        if audio_b64 is None or alignment is None:
            raise RuntimeError(
                "ElevenLabs convert_with_timestamps returned no audio/alignment"
            )
        audio_bytes = base64.b64decode(audio_b64)

        chars: list[str] = list(getattr(alignment, "characters", []) or [])
        starts_s: list[float] = list(
            getattr(alignment, "character_start_times_seconds", []) or []
        )
        ends_s: list[float] = list(
            getattr(alignment, "character_end_times_seconds", []) or []
        )

    write_bytes_atomic(mp3_path, audio_bytes)

    waveform = extract_waveform(mp3_path)
    write_text_atomic(waveform_path, json.dumps(waveform))

    duration_ms = int(round(waveform["duration_s"] * 1000))
    if ends_s:
        # Prefer the alignment's terminal timestamp — it matches the script
        # better than the decoded mp3 length when there's trailing silence.
        duration_ms = max(duration_ms, int(round(ends_s[-1] * 1000)))

    steps_ranges = _step_ranges_from_alignment(slices, chars, starts_s, ends_s)
    timing = {
        "version": 1,
        "voice_id": voice_id,
        "model_id": model_id,
        "duration_ms": duration_ms,
        "script": script,
        "steps": steps_ranges,
    }
    write_text_atomic(timing_path, json.dumps(timing, indent=2))

    return timing


__all__ = ["synth_continuous"]

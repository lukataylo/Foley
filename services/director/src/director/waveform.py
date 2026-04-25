"""Extract a downsampled amplitude waveform per narration mp3.

Output is a tiny JSON: a list of floats in [0, 1] at WAVE_SAMPLES_PER_SECOND
buckets/second. The cutroom timeline reads these to draw the waveform track.

We run ffmpeg once at 1 kHz mono float32, then average groups of samples down
to the target rate. Total IO per step is < 1 KB of JSON.
"""

from __future__ import annotations

import json
import math
import struct
import subprocess
from pathlib import Path

# Granularity of the waveform shown in the cutroom timeline. 30 buckets/s gives
# us a smooth wave at typical zoom without inflating the JSON.
WAVE_SAMPLES_PER_SECOND = 30


def extract_waveform(mp3_path: Path) -> dict:
    """Return {duration_s, sample_rate, peaks} for the given mp3."""
    # Pull mono float32 samples at 1 kHz — plenty of resolution to bucket down.
    decode_rate = 1000
    proc = subprocess.run(
        [
            "ffmpeg",
            "-v", "error",
            "-i", str(mp3_path),
            "-ac", "1",
            "-ar", str(decode_rate),
            "-f", "f32le",
            "-",
        ],
        capture_output=True,
        check=True,
    )
    raw = proc.stdout
    n = len(raw) // 4
    if n == 0:
        return {"duration_s": 0.0, "sample_rate": WAVE_SAMPLES_PER_SECOND, "peaks": []}
    samples = struct.unpack(f"<{n}f", raw)

    bucket = max(1, decode_rate // WAVE_SAMPLES_PER_SECOND)
    peaks: list[float] = []
    for i in range(0, n, bucket):
        chunk = samples[i : i + bucket]
        # peak (max abs) — better visually than RMS for narration
        m = 0.0
        for s in chunk:
            a = abs(s)
            if a > m:
                m = a
        peaks.append(round(m, 4))

    # Normalize to 0..1 against the global peak so the wave fills the lane.
    peak = max(peaks) if peaks else 1.0
    if peak > 0:
        peaks = [round(p / peak, 4) for p in peaks]

    duration_s = n / decode_rate
    return {
        "duration_s": round(duration_s, 3),
        "sample_rate": WAVE_SAMPLES_PER_SECOND,
        "peaks": peaks,
    }


def write_waveform(mp3_path: Path, json_path: Path | None = None) -> Path:
    """Run extract_waveform and write the JSON next to the mp3."""
    if json_path is None:
        json_path = mp3_path.with_suffix(".json")
        # narrator file is foo.narration.mp3; we want foo.waveform.json
        if mp3_path.name.endswith(".narration.mp3"):
            json_path = mp3_path.with_name(
                mp3_path.name[: -len(".narration.mp3")] + ".waveform.json"
            )
    data = extract_waveform(mp3_path)
    json_path.write_text(json.dumps(data))
    return json_path


__all__ = ["extract_waveform", "write_waveform", "WAVE_SAMPLES_PER_SECOND"]

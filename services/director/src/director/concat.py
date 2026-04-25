"""ffmpeg concat-demuxer master assembly.

Deterministic codec params so unchanged step clips are byte-identical
across takes. Implementation lands in Phase 5.
"""

from __future__ import annotations

# Pinned encode parameters used by every step clip and the master.
# Identical params + identical input = byte-identical clip.
ENCODE_ARGS = [
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-g", "60",            # GOP = 2s
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "44100",
    "-movflags", "+faststart",
]


def assemble_master(*args, **kwargs):  # noqa: ARG001
    raise NotImplementedError("Phase 5: implement ffmpeg concat master.")

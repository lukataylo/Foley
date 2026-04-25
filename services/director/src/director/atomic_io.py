"""Atomic file writes.

Every JSON/YAML/MP3/log file we write to disk should go through one of these.
Direct writes risk leaving a half-written file on disk if the process is
interrupted (Ctrl-C, OOM kill, ffmpeg crash) — and any consumer that does a
naive `JSON.parse(read(...))` will then 500 forever until the file is
manually cleaned up.

The pattern is the standard one: write to `<path>.<pid>.tmp`, fsync, then
`os.replace` to the final path. `os.replace` is atomic on POSIX and Windows
when the source and destination are on the same filesystem (which they will
be — we always write into the same directory).
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def _atomic_write(path: Path, write: callable) -> None:
    """Write via a sibling tempfile, fsync, then rename. Caller passes a
    `write(file_handle)` callback that produces the bytes/string."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Sibling tempfile so the rename is on the same filesystem (atomic).
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as f:
            write(f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        # Best-effort cleanup; don't shadow the original error.
        try:
            tmp_path.unlink()
        except FileNotFoundError:
            pass
        raise


def write_text_atomic(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write `text` to `path` atomically. Replaces an existing file."""
    data = text.encode(encoding)
    _atomic_write(Path(path), lambda f: f.write(data))


def write_bytes_atomic(path: Path, data: bytes) -> None:
    """Write `data` to `path` atomically. Replaces an existing file."""
    _atomic_write(Path(path), lambda f: f.write(data))


def write_json_atomic(path: Path, obj: Any, *, indent: int | None = 2) -> None:
    """Serialize `obj` as JSON and write atomically. The default `indent=2`
    matches the manifest/take.json formatting used everywhere else."""
    text = json.dumps(obj, indent=indent)
    write_text_atomic(Path(path), text)


__all__ = ["write_text_atomic", "write_bytes_atomic", "write_json_atomic"]

"""ElevenLabs narration. Hash-cached: identical text+voice → identical bytes."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from elevenlabs.client import ElevenLabs

from .atomic_io import write_bytes_atomic
from .config import settings
from .logfire_setup import span
from .waveform import write_waveform


def _cache_key(text: str, voice_id: str, model_id: str) -> str:
    h = hashlib.sha256()
    h.update(voice_id.encode())
    h.update(b"\x00")
    h.update(model_id.encode())
    h.update(b"\x00")
    h.update(text.encode())
    return h.hexdigest()[:16]


def synth(
    text: str,
    out_path: Path,
    voice_id: str | None = None,
    model_id: str = "eleven_turbo_v2_5",
) -> Path:
    """Synthesize narration to mp3. Cached by hash(text + voice + model)."""
    voice_id = voice_id or settings.elevenlabs_voice_id
    key = _cache_key(text, voice_id, model_id)

    cache_dir = out_path.parent / ".narration-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{key}.mp3"

    with span("narrator.synth", voice_id=voice_id, model=model_id, chars=len(text), key=key):
        if cache_path.exists():
            write_bytes_atomic(out_path, cache_path.read_bytes())
        else:
            settings.require("ELEVENLABS_API_KEY")
            client = ElevenLabs(api_key=settings.elevenlabs_api_key)
            audio_iter = client.text_to_speech.convert(
                voice_id=voice_id,
                model_id=model_id,
                text=text,
                output_format="mp3_44100_128",
            )
            data = b"".join(audio_iter)
            write_bytes_atomic(cache_path, data)
            write_bytes_atomic(out_path, data)

    # Write the sibling waveform JSON next to the mp3 so the cutroom can
    # render the audio track without re-decoding on the client.
    try:
        write_waveform(out_path)
    except Exception:
        # Don't let waveform extraction block ingest — log and move on.
        pass

    return out_path


def smoke() -> None:
    """`uv run python -m director.narrator --smoke` — synth a hello clip."""
    out = Path(__file__).resolve().parents[3] / "scratch" / "smoke.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    synth(
        "Foley keeps your product walkthroughs on brand, automatically.",
        out,
    )
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    if "--smoke" in sys.argv:
        smoke()
    else:
        print("usage: python -m director.narrator --smoke")
        sys.exit(2)

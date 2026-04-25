"""Drive the demo app, capture clip + frame + meta per Step.

One Playwright context per step → one webm. We then transcode to mp4
with pinned codec params so unchanged steps produce byte-identical clips
across runs (the heart of Foley's reuse story).

Idempotent on `step.fingerprint()`: if the cached meta.json matches, we
skip re-capture. The agent uses this to short-circuit "this step did not
actually change."
"""

from __future__ import annotations

import json
import shutil
import subprocess
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from .atomic_io import write_text_atomic
from .concat import ENCODE_ARGS
from .logfire_setup import span
from .models import Action, ActionKind, Step, Walkthrough, step_artifact_paths


def _do(page: Page, action: Action, base_url: str) -> None:
    match action.kind:
        case ActionKind.GOTO:
            url = action.url or "/"
            if url.startswith("/"):
                url = base_url.rstrip("/") + url
            page.goto(url, wait_until="networkidle")
        case ActionKind.CLICK:
            page.click(action.selector or "")
        case ActionKind.FILL:
            page.fill(action.selector or "", action.value or "")
        case ActionKind.HOVER:
            page.hover(action.selector or "")
        case ActionKind.WAIT:
            page.wait_for_timeout(action.ms or 0)
        case ActionKind.SCROLL:
            # selector optional; if absent scroll the page
            if action.selector:
                page.locator(action.selector).scroll_into_view_if_needed()
            else:
                page.mouse.wheel(0, action.ms or 400)
        case ActionKind.PRESS:
            page.keyboard.press(action.value or "")


def _transcode_to_mp4(src_webm: Path, dst_mp4: Path, duration_ms: int) -> None:
    """webm → mp4 with pinned codec params + trim to step's declared duration."""
    duration_s = duration_ms / 1000.0
    cmd = [
        "ffmpeg", "-y",
        "-i", str(src_webm),
        "-t", f"{duration_s:.3f}",
        *ENCODE_ARGS,
        "-an",  # narration arrives separately as mp3
        str(dst_mp4),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def capture_step(
    walkthrough: Walkthrough,
    step: Step,
    walkthroughs_dir: Path,
    *,
    headed: bool = False,
    force: bool = False,
) -> dict[str, Path]:
    """Capture one step. Returns the artifact paths."""
    paths = step_artifact_paths(walkthroughs_dir, walkthrough.id, step.id)
    paths["clip"].parent.mkdir(parents=True, exist_ok=True)

    fp = step.fingerprint()
    meta_path = paths["meta"]

    if not force and meta_path.exists():
        try:
            cached = json.loads(meta_path.read_text())
            if cached.get("fingerprint") == fp and paths["clip"].exists():
                with span("playwright.cache_hit", step_id=step.id, fingerprint=fp):
                    return paths
        except (json.JSONDecodeError, OSError):
            pass

    base_url = walkthrough.target_app.dev_url
    tmp_dir = walkthroughs_dir / walkthrough.id / "steps" / f".{step.id}.tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    with span("playwright.capture", step_id=step.id, actions=len(step.actions)):
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=not headed)
            context = browser.new_context(
                viewport={"width": step.viewport.width, "height": step.viewport.height},
                record_video_dir=str(tmp_dir),
                record_video_size={"width": step.viewport.width, "height": step.viewport.height},
                device_scale_factor=1,
                color_scheme="dark",
            )
            page = context.new_page()

            # If the first action isn't a goto, prime the page with the dev_url root.
            if not step.actions or step.actions[0].kind is not ActionKind.GOTO:
                page.goto(base_url, wait_until="networkidle")

            t0 = time.monotonic()
            for action in step.actions:
                _do(page, action, base_url)

            # Final frame for thumbnails & previews.
            page.screenshot(path=str(paths["frame"]), full_page=False)

            elapsed_ms = int((time.monotonic() - t0) * 1000)

            # Closing the context finalizes the video file.
            video = page.video
            context.close()
            browser.close()

            assert video is not None, "context was created with record_video_dir"
            webm_path = Path(video.path())

    _transcode_to_mp4(webm_path, paths["clip"], step.duration_ms)

    meta = {
        "step_id": step.id,
        "fingerprint": fp,
        "actual_duration_ms": elapsed_ms,
        "declared_duration_ms": step.duration_ms,
        "viewport": step.viewport.model_dump(),
        "actions": [a.model_dump(exclude_none=True) for a in step.actions],
    }
    write_text_atomic(meta_path, json.dumps(meta, indent=2))
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return paths


__all__ = ["capture_step"]

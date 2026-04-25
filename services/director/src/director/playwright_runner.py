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

from playwright.sync_api import Error as PWError, Page, TimeoutError as PWTimeoutError, sync_playwright

from .atomic_io import write_text_atomic
from .concat import ENCODE_ARGS
from .logfire_setup import span
from .models import Action, ActionKind, Step, Walkthrough, step_artifact_paths

# Hard timeout per Playwright action. The auto-proposed walkthroughs use
# text-locator selectors; if Claude inferred something slightly off, we'd
# rather move on with a static shot than hang for 30 s.
DEFAULT_ACTION_TIMEOUT_MS = 8000

# What the per-step `meta.json` carries when an action failed. We keep the
# shape stable so the cutroom can render a red dot + tooltip per step.
ActionWarning = dict[str, str | int | None]


def _do(page: Page, action: Action, base_url: str) -> None:
    """Execute one action with a tight timeout. Raises on failure; the caller
    wraps this so a single bad action doesn't abort the whole step."""
    match action.kind:
        case ActionKind.GOTO:
            url = action.url or "/"
            if url.startswith("/"):
                url = base_url.rstrip("/") + url
            page.goto(url, wait_until="networkidle", timeout=DEFAULT_ACTION_TIMEOUT_MS)
        case ActionKind.CLICK:
            page.click(action.selector or "", timeout=DEFAULT_ACTION_TIMEOUT_MS)
        case ActionKind.FILL:
            page.fill(
                action.selector or "",
                action.value or "",
                timeout=DEFAULT_ACTION_TIMEOUT_MS,
            )
        case ActionKind.HOVER:
            page.hover(action.selector or "", timeout=DEFAULT_ACTION_TIMEOUT_MS)
        case ActionKind.WAIT:
            page.wait_for_timeout(action.ms or 0)
        case ActionKind.SCROLL:
            # selector optional; if absent scroll the page
            if action.selector:
                page.locator(action.selector).scroll_into_view_if_needed(
                    timeout=DEFAULT_ACTION_TIMEOUT_MS,
                )
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
    """Capture one step. Returns the artifact paths.

    Resilience contract:
      - A single action failure (selector miss, timeout) is *recorded*, not
        raised. The browser continues with the remaining actions; the step
        still produces a clip + frame + meta.json.
      - A catastrophic failure before the page is recording (browser launch,
        first goto times out) is raised, but the meta.json is still written
        with `error` set so the cutroom can show a retake button.
      - `meta.actions[i].warning` carries per-action failure messages so the
        editor can surface them (T1.3 UI).
    """
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

    action_warnings: list[ActionWarning] = []
    step_error: str | None = None
    elapsed_ms = 0
    webm_path: Path | None = None

    with span("playwright.capture", step_id=step.id, actions=len(step.actions)):
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=not headed)
                context = browser.new_context(
                    viewport={"width": step.viewport.width, "height": step.viewport.height},
                    record_video_dir=str(tmp_dir),
                    record_video_size={
                        "width": step.viewport.width,
                        "height": step.viewport.height,
                    },
                    device_scale_factor=1,
                    color_scheme="dark",
                )
                page = context.new_page()

                # Prime the page if the first action isn't a goto. We use a
                # generous timeout here because nothing has been recorded yet
                # — failing early is fine.
                if not step.actions or step.actions[0].kind is not ActionKind.GOTO:
                    try:
                        page.goto(base_url, wait_until="networkidle", timeout=15_000)
                    except (PWTimeoutError, PWError) as exc:
                        # Couldn't even reach the dev server. We still record
                        # something so the editor can show "Retake".
                        action_warnings.append(
                            {
                                "index": -1,
                                "kind": "prime_goto",
                                "selector": None,
                                "message": str(exc).splitlines()[0][:200],
                            }
                        )

                t0 = time.monotonic()
                for i, action in enumerate(step.actions):
                    try:
                        _do(page, action, base_url)
                    except (PWTimeoutError, PWError) as exc:
                        # Log and keep going. The static frame the camera is
                        # already on becomes the step's "clip" — better than
                        # zero output.
                        action_warnings.append(
                            {
                                "index": i,
                                "kind": action.kind.value,
                                "selector": action.selector,
                                "message": str(exc).splitlines()[0][:200],
                            }
                        )

                # Final frame for thumbnails & previews. Best-effort.
                try:
                    page.screenshot(path=str(paths["frame"]), full_page=False)
                except (PWTimeoutError, PWError):
                    pass

                elapsed_ms = int((time.monotonic() - t0) * 1000)

                # Closing the context finalizes the video file.
                video = page.video
                context.close()
                browser.close()

                if video is not None:
                    webm_path = Path(video.path())
        except (PWTimeoutError, PWError) as exc:
            # Browser launch or bootstrap failed entirely. Surface as a
            # step-level error rather than tearing down the ingest run.
            step_error = str(exc).splitlines()[0][:300]

    if webm_path is not None and webm_path.exists():
        try:
            _transcode_to_mp4(webm_path, paths["clip"], step.duration_ms)
        except subprocess.CalledProcessError as exc:
            step_error = (
                step_error
                or f"ffmpeg transcode failed: {(exc.stderr or b'').decode(errors='replace')[:200]}"
            )

    meta: dict = {
        "step_id": step.id,
        "fingerprint": fp,
        "actual_duration_ms": elapsed_ms,
        "declared_duration_ms": step.duration_ms,
        "viewport": step.viewport.model_dump(),
        "actions": [a.model_dump(exclude_none=True) for a in step.actions],
    }
    if action_warnings:
        meta["action_warnings"] = action_warnings
    if step_error:
        meta["error"] = step_error
    write_text_atomic(meta_path, json.dumps(meta, indent=2))
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return paths


__all__ = ["capture_step", "DEFAULT_ACTION_TIMEOUT_MS"]

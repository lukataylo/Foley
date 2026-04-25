"""`director check` — strict validator + link checker + a11y triage.

Mintlify ships `mint validate`, `mint broken-links`, and `mint a11y` as
separate CLI commands. We unify them under a single command that takes a
walkthrough id and prints a coloured report, exiting non-zero if any
hard error is found. Soft warnings (e.g. orphaned step recordings) are
listed but don't fail the run.

Checks:
  - schema   — load_walkthrough succeeds (Pydantic validation, brand
               file resolution, atomic-write happy paths). Already
               implemented in walkthrough_loader.py; we re-use it.
  - links    — every URL in narration text is reachable (best-effort,
               5s timeout each).
  - artifacts— every step has either a cached clip or is flagged as
               needing-retake; orphan files in steps/ are listed.
  - a11y     — narration text has reasonable length per step (~5 s
               worth at the brand's pacing_wpm), no all-caps shouting,
               and step titles aren't blank.
  - timing   — declared step duration_ms vs actual_duration_ms in
               meta.json; large drift gets a warning.

Exit codes:
  0 — all green
  1 — at least one ERROR
  2 — only WARNs
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from .models import Walkthrough, step_artifact_paths
from .walkthrough_loader import WalkthroughLoadError, load_walkthrough

URL_RE = re.compile(r"https?://[^\s)\"'<>]+", re.IGNORECASE)


@dataclass
class CheckIssue:
    severity: str  # "error" | "warn" | "info"
    category: str
    where: str
    message: str


@dataclass
class CheckReport:
    walkthrough_id: str
    issues: list[CheckIssue] = field(default_factory=list)

    def add(self, severity: str, category: str, where: str, message: str) -> None:
        self.issues.append(CheckIssue(severity=severity, category=category, where=where, message=message))

    @property
    def errors(self) -> list[CheckIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[CheckIssue]:
        return [i for i in self.issues if i.severity == "warn"]

    def exit_code(self) -> int:
        if self.errors:
            return 1
        if self.warnings:
            return 2
        return 0


def _check_schema(report: CheckReport, walkthrough_dir: Path) -> Walkthrough | None:
    try:
        wt = load_walkthrough(walkthrough_dir)
        report.add("info", "schema", "walkthrough.yaml", "schema valid")
        return wt
    except WalkthroughLoadError as exc:
        report.add("error", "schema", "walkthrough.yaml", exc.message)
        return None


def _check_links(report: CheckReport, wt: Walkthrough, *, network: bool = True) -> None:
    """Walk every step's narration; report any URL that 404s or times out."""
    if not network:
        return
    seen: set[str] = set()
    targets: list[tuple[str, str]] = []
    for step in wt.steps:
        for m in URL_RE.findall(step.narration or ""):
            url = m.rstrip(".,;:")  # strip trailing punctuation
            if url in seen:
                continue
            seen.add(url)
            targets.append((step.id, url))

    if not targets:
        report.add("info", "links", "narration", "no URLs in narration text")
        return

    with httpx.Client(
        timeout=5.0, follow_redirects=True, headers={"User-Agent": "foley-link-check/1"}
    ) as client:
        for step_id, url in targets:
            try:
                r = client.head(url)
                if r.status_code >= 400:
                    # Some servers don't accept HEAD; retry GET.
                    r = client.get(url)
                if r.status_code >= 400:
                    report.add(
                        "error",
                        "links",
                        f"step {step_id}",
                        f"{url} → HTTP {r.status_code}",
                    )
            except httpx.HTTPError as exc:
                report.add(
                    "warn",
                    "links",
                    f"step {step_id}",
                    f"{url} unreachable ({type(exc).__name__})",
                )


def _check_artifacts(report: CheckReport, wt: Walkthrough, walkthroughs_dir: Path) -> None:
    declared_ids = {s.id for s in wt.steps}
    steps_dir = walkthroughs_dir / wt.id / "steps"

    for step in wt.steps:
        paths = step_artifact_paths(walkthroughs_dir, wt.id, step.id)
        clip_ok = paths["clip"].exists() and paths["clip"].stat().st_size > 0
        meta_path = paths["meta"]
        if not clip_ok:
            report.add(
                "warn",
                "artifacts",
                f"step {step.id}",
                "no clip cached — will run Playwright on next ingest",
            )
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                if meta.get("error"):
                    report.add(
                        "warn",
                        "artifacts",
                        f"step {step.id}",
                        f"last capture failed: {meta['error']}",
                    )
                if meta.get("action_warnings"):
                    n = len(meta["action_warnings"])
                    report.add(
                        "warn",
                        "artifacts",
                        f"step {step.id}",
                        f"last capture had {n} action warning(s)",
                    )
                actual = meta.get("actual_duration_ms")
                declared = step.duration_ms
                if actual and declared and actual > 0:
                    drift = abs(actual - declared) / declared
                    if drift > 0.5:
                        report.add(
                            "warn",
                            "timing",
                            f"step {step.id}",
                            f"actual {actual}ms vs declared {declared}ms (drift {drift:.0%})",
                        )
            except (json.JSONDecodeError, OSError):
                report.add("warn", "artifacts", f"step {step.id}", "meta.json unreadable")

    # Orphan files (steps/<X>.mp4 with no matching step id)
    if steps_dir.exists():
        for f in steps_dir.iterdir():
            if not f.is_file():
                continue
            stem = f.stem
            for suffix in (".meta", ".narration", ".waveform"):
                if stem.endswith(suffix):
                    stem = stem[: -len(suffix)]
                    break
            if stem and stem not in declared_ids:
                report.add(
                    "info",
                    "artifacts",
                    f"steps/{f.name}",
                    "orphan — no matching step id in walkthrough.yaml",
                )


def _check_a11y(report: CheckReport, wt: Walkthrough) -> None:
    pacing = wt.brand.pacing_wpm or 170
    for step in wt.steps:
        title = (step.title or "").strip()
        narration = (step.narration or "").strip()
        if not title:
            report.add("error", "a11y", f"step {step.id}", "title is blank")
        if not narration:
            report.add("error", "a11y", f"step {step.id}", "narration is blank")
        if narration:
            words = len(narration.split())
            min_words = int(step.duration_ms / 1000 / 60 * pacing * 0.4)
            max_words = int(step.duration_ms / 1000 / 60 * pacing * 1.6)
            if words < min_words and words < 4:
                report.add(
                    "warn",
                    "a11y",
                    f"step {step.id}",
                    f"narration is just {words} words for {step.duration_ms}ms — silence will dominate",
                )
            if words > max_words:
                report.add(
                    "warn",
                    "a11y",
                    f"step {step.id}",
                    f"narration ({words} words) likely exceeds {step.duration_ms}ms at {pacing} wpm — consider shortening or extending duration",
                )
            if narration.upper() == narration and any(c.isalpha() for c in narration):
                report.add(
                    "warn",
                    "a11y",
                    f"step {step.id}",
                    "narration is ALL CAPS — TTS will sound shouty",
                )


def check_walkthrough(
    walkthrough_dir: Path,
    *,
    network: bool = True,
) -> CheckReport:
    """Run every check, return the report. Caller decides how to format."""
    report = CheckReport(walkthrough_id=walkthrough_dir.name)
    wt = _check_schema(report, walkthrough_dir)
    if wt is None:
        return report
    _check_links(report, wt, network=network)
    _check_artifacts(report, wt, walkthrough_dir.parent)
    _check_a11y(report, wt)
    return report


__all__ = ["CheckIssue", "CheckReport", "check_walkthrough"]

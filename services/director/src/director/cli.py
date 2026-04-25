"""Director CLI.

  director ingest                  bake the v1 master from walkthrough.yaml
  director retake STEP_ID          re-run a single step
  director master                  concat current step artifacts → master.mp4
  director review PR_NUMBER        diff a PR and propose a new take
"""

from __future__ import annotations

from pathlib import Path

import typer
from rich import print as rprint
from rich.table import Table

from . import __version__
from .agent import review_pr as run_agent
from .atomic_io import write_text_atomic
from .bake_master import bake_master
from .captions import write_captions
from .concat import assemble_master, diff_takes
from .config import settings
from .continuous_narration import synth_continuous
from .github import fetch_pr_diff, fetch_pr_meta
from .logfire_setup import configure as configure_logfire
from .models import StepDiff, StepStatus, TakeStatus
from .narrator import synth as synth_narration
from .playwright_runner import capture_step
from .proposer import propose_steps as run_proposer
from .proposer import write_proposed_steps
from .walkthrough_loader import load_walkthrough

app = typer.Typer(
    name="director",
    no_args_is_help=True,
    help="Foley's director — diff PRs, retake steps, assemble masters.",
)


@app.callback()
def _main() -> None:
    configure_logfire()


def _walkthrough_dir(walkthrough_id: str) -> Path:
    return settings.walkthroughs_dir / walkthrough_id


@app.command()
def version() -> None:
    """Print director version."""
    rprint(f"director [bold]{__version__}[/]")


@app.command()
def ingest(
    walkthrough_id: str = typer.Argument("v1"),
    headed: bool = typer.Option(False, "--headed", help="Show the browser while capturing."),
    force: bool = typer.Option(False, "--force", help="Re-capture even if fingerprint matches."),
    skip_narration: bool = typer.Option(False, "--skip-narration"),
) -> None:
    """Run every step from walkthrough.yaml: capture clip + frame + narration.

    Resilient: per-step failures are logged in the summary table but never
    abort the loop. The cutroom surfaces step.error from meta.json with a
    retake button.
    """
    wt_dir = _walkthrough_dir(walkthrough_id)
    wt = load_walkthrough(wt_dir)

    table = Table(title=f"ingest · {wt.id} v{wt.version} · {len(wt.steps)} steps")
    table.add_column("step")
    table.add_column("title")
    table.add_column("clip")
    table.add_column("narration")
    table.add_column("warnings")

    failed: list[tuple[str, str]] = []
    for step in wt.steps:
        try:
            paths = capture_step(
                wt, step, settings.walkthroughs_dir, headed=headed, force=force
            )
        except Exception as exc:
            # Truly unexpected (not a Playwright error — those are caught inside).
            failed.append((step.id, f"capture_step raised: {exc}"))
            table.add_row(step.id, step.title, "[red]ERR[/]", "skipped", str(exc)[:60])
            continue

        # Read meta to surface warnings (best-effort).
        warnings_count = 0
        try:
            meta = _json.loads((paths["meta"]).read_text())
            warnings_count = len(meta.get("action_warnings", []))
            if meta.get("error"):
                failed.append((step.id, meta["error"]))
        except Exception:
            pass

        narration_status = "skipped"
        if not skip_narration:
            try:
                synth_narration(step.narration, paths["narration"], voice_id=wt.brand.voice_id)
                narration_status = f"{paths['narration'].stat().st_size}B"
            except Exception as exc:
                narration_status = "[red]FAIL[/]"
                failed.append((step.id, f"narrate: {exc}"))

        clip_status = (
            f"{paths['clip'].stat().st_size}B" if paths["clip"].exists() else "[red]MISSING[/]"
        )
        warning_cell = f"[yellow]{warnings_count}[/]" if warnings_count else ""
        table.add_row(step.id, step.title, clip_status, narration_status, warning_cell)

    rprint(table)
    if failed:
        rprint(f"\n[yellow]ingest finished with {len(failed)} issue(s):[/]")
        for sid, msg in failed:
            rprint(f"  [yellow]·[/] {sid}: {msg[:200]}")
        rprint("[dim]The master can still bake; retake individual steps from the editor.[/]")


@app.command()
def retake(
    step_id: str,
    walkthrough_id: str = typer.Argument("v1"),
    headed: bool = typer.Option(False, "--headed"),
) -> None:
    """Re-run a single step's capture and narration."""
    wt_dir = _walkthrough_dir(walkthrough_id)
    wt = load_walkthrough(wt_dir)
    step = wt.step(step_id)
    paths = capture_step(wt, step, settings.walkthroughs_dir, headed=headed, force=True)
    synth_narration(step.narration, paths["narration"], voice_id=wt.brand.voice_id)
    rprint(f"[green]retake[/] {step_id}: clip + narration refreshed")


@app.command()
def master(
    walkthrough_id: str = typer.Argument("v1"),
    take_id: str = typer.Option("master", "--take", help="Take id to write under takes/<id>/."),
) -> None:
    """Concat the current step artifacts into a take's master.mp4."""
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))
    # The canonical master is approved by definition; PR takes start READY and
    # get APPROVED in the cutroom.
    status = TakeStatus.APPROVED if take_id == "master" else TakeStatus.READY
    manifest = assemble_master(wt, settings.walkthroughs_dir, take_id=take_id, status=status)
    rprint(
        f"[green]master[/] {walkthrough_id}/{take_id}: "
        f"{len(manifest['segments'])} segments, sha256={manifest['master_sha256'][:12]}…"
    )


@app.command("captions")
def captions_cmd(
    walkthrough_id: str = typer.Argument("v1"),
) -> None:
    """Generate walkthroughs/<id>/captions.vtt from narration.timing.json.

    Writes one cue per step using each step's title + narration. The
    walkthrough must have a continuous narration take on disk (run
    `director synth-continuous <id>` first).
    """
    out = write_captions(_walkthrough_dir(walkthrough_id))
    rprint(f"[green]captions[/] {walkthrough_id}: wrote {out}")


@app.command("propose-steps")
def propose_steps_cmd(
    walkthrough_id: str = typer.Argument(..., help="Walkthrough id (e.g. the slug from onboarding)."),
    dev_url: str | None = typer.Option(
        None,
        "--dev-url",
        help="Override the dev_url to fetch the landing page from. Defaults to walkthrough.yaml's target_app.dev_url.",
    ),
    description: str = typer.Option(
        "",
        "--description",
        help="Short product description for the model — usually the GitHub repo description.",
    ),
) -> None:
    """Draft 3–8 walkthrough steps for a freshly onboarded project.

    Reads the bootstrapped walkthrough.yaml, calls Claude with the dev URL's
    landing-page HTML for grounding, and writes the proposed Steps back into
    the same file (replacing the stub `intro` step from onboarding).
    """
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))
    proposed = run_proposer(wt, description=description, dev_url=dev_url)
    write_proposed_steps(_walkthrough_dir(walkthrough_id), proposed)
    rprint(
        f"[green]propose-steps[/] {walkthrough_id}: "
        f"{len(proposed.steps)} steps drafted — {proposed.summary}"
    )


@app.command("synth-continuous")
def synth_continuous_cmd(
    walkthrough_id: str = typer.Argument("v1"),
) -> None:
    """Synth one continuous ElevenLabs narration for the whole walkthrough.

    Joins every step's narration into a single TTS call so prosody carries
    across boundaries (no choppy per-step concatenation), then writes:

      walkthroughs/<id>/narration.mp3
      walkthroughs/<id>/narration.timing.json
      walkthroughs/<id>/narration.waveform.json

    The cutroom timeline picks these up the next time it loads.
    """
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))
    timing = synth_continuous(wt, settings.walkthroughs_dir)
    rprint(
        f"[green]synth-continuous[/] {walkthrough_id}: "
        f"{timing['duration_ms'] / 1000:.1f}s, {len(timing['steps'])} steps mapped"
    )


@app.command("bake-master")
def bake_master_cmd(
    walkthrough_id: str = typer.Argument("v1"),
    intro: Path | None = typer.Option(None, "--intro", help="PNG to use as the intro slide."),
    outro: Path | None = typer.Option(None, "--outro", help="PNG to use as the outro slide."),
    intro_s: float = typer.Option(3.0, "--intro-duration"),
    outro_s: float = typer.Option(3.0, "--outro-duration"),
    take_id: str = typer.Option("master", "--take"),
) -> None:
    """Bake intro/outro PNG bookends into the take's master.mp4 with fades."""
    if intro is None and outro is None:
        rprint("[red]nothing to do[/]: pass --intro and/or --outro")
        raise typer.Exit(1)
    result = bake_master(
        settings.walkthroughs_dir,
        walkthrough_id,
        intro_png=intro.resolve() if intro else None,
        outro_png=outro.resolve() if outro else None,
        intro_duration_s=intro_s,
        outro_duration_s=outro_s,
        take_id=take_id,
    )
    rprint(
        f"[green]baked[/] {walkthrough_id}/{take_id}: "
        f"sha {result['master_sha256'][:12]}…"
    )


@app.command("diff-takes")
def diff_takes_cmd(
    take_a: str,
    take_b: str,
    walkthrough_id: str = typer.Argument("v1"),
) -> None:
    """Compare per-segment hashes between two takes. Proves byte-identity on UNCHANGED."""
    rows = diff_takes(settings.walkthroughs_dir, walkthrough_id, take_a, take_b)
    table = Table(title=f"{take_a} vs {take_b}")
    table.add_column("step")
    table.add_column("identical")
    table.add_column("sha A")
    table.add_column("sha B")
    for r in rows:
        sa = (r["a"]["segment_sha256"][:12] + "…") if r["a"] else "—"
        sb = (r["b"]["segment_sha256"][:12] + "…") if r["b"] else "—"
        marker = "[green]✓[/]" if r["identical"] else "[yellow]✗[/]"
        table.add_row(r["step_id"], marker, sa, sb)
    rprint(table)


@app.command()
def review(
    pr_number: int,
    walkthrough_id: str = typer.Argument("v1"),
    parent_take: str = typer.Option("master", "--parent", help="Take to compare against."),
) -> None:
    """Diff a PR, run the agent, retake affected steps, build a new take."""
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))
    pr_meta = fetch_pr_meta(pr_number)
    pr_diff = fetch_pr_diff(pr_number)

    rprint(f"[bold]review[/] PR #{pr_number}: {pr_meta['title']}")
    rprint(f"[dim]{len(pr_diff)} chars of diff, {len(wt.steps)} steps in walkthrough[/]")

    verdict = run_agent(
        wt,
        pr_diff,
        pr_title=pr_meta.get("title", ""),
        pr_body=pr_meta.get("body", ""),
    )

    rprint(f"\n[bold]director's verdict[/]: {verdict.summary}\n")
    _print_verdict_table(verdict)
    _retake_and_assemble(
        wt,
        verdict,
        take_id=f"take-{pr_number:03d}",
        parent_take=parent_take,
        pr_number=pr_number,
        pr_title=pr_meta.get("title", ""),
    )


def _print_verdict_table(verdict) -> None:
    table = Table()
    table.add_column("step")
    table.add_column("status")
    table.add_column("reason")
    for d in verdict.step_diffs:
        style = _STATUS_STYLES.get(d.status, "")
        table.add_row(d.step_id, f"[{style}]{d.status.value}[/]", d.reason)
    rprint(table)


@app.command("review-fixture")
def review_fixture(
    fixture: str = typer.Argument(..., help="Fixture dir under tests/fixtures/"),
    walkthrough_id: str = typer.Argument("v1"),
    parent_take: str = typer.Option("master", "--parent"),
) -> None:
    """End-to-end review using a saved fixture instead of fetching a live PR.

    Useful for replicating the production loop locally — point the demo app
    at the post-PR state, then run this against the matching fixture.
    """
    import json as _json

    fixtures_root = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
    fdir = fixtures_root / fixture
    if not fdir.exists():
        rprint(f"[red]no fixture[/]: {fdir}")
        raise typer.Exit(1)

    pr = _json.loads((fdir / "pr.json").read_text())
    diff = (fdir / "pr.diff").read_text()
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))

    rprint(f"[bold]review-fixture[/] {fixture}: {pr.get('title', '')}")
    verdict = run_agent(
        wt, diff, pr_title=pr.get("title", ""), pr_body=pr.get("body", "")
    )
    rprint(f"\n[bold]director's verdict[/]: {verdict.summary}\n")
    _print_verdict_table(verdict)

    pr_number = int(pr.get("number") or 0)
    take_id = f"take-{pr_number:03d}" if pr_number else f"take-{fixture}"
    _retake_and_assemble(
        wt,
        verdict,
        take_id=take_id,
        parent_take=parent_take,
        pr_number=pr_number or None,
        pr_title=pr.get("title", ""),
    )


_STATUS_STYLES = {
    StepStatus.UNCHANGED: "dim",
    StepStatus.CHANGED: "yellow",
    StepStatus.ADDED: "green",
    StepStatus.REMOVED: "red",
}


def _retake_and_assemble(
    wt,
    verdict,
    *,
    take_id: str,
    parent_take: str = "master",
    pr_number: int | None = None,
    pr_title: str | None = None,
):
    """Shared post-agent pipeline: retake CHANGED/ADDED steps, build new master."""
    for d in verdict.step_diffs:
        if d.status in (StepStatus.CHANGED, StepStatus.ADDED) and d.proposed_step is not None:
            capture_step(wt, d.proposed_step, settings.walkthroughs_dir, force=True)
            paths = settings.walkthroughs_dir / wt.id / "steps" / f"{d.proposed_step.id}.narration.mp3"
            synth_narration(d.proposed_step.narration, paths, voice_id=wt.brand.voice_id)
            rprint(f"  retook [yellow]{d.proposed_step.id}[/]")

    extended_steps = list(wt.steps)
    for d in verdict.step_diffs:
        if d.status is StepStatus.ADDED and d.proposed_step is not None:
            extended_steps.append(d.proposed_step)
    wt = wt.model_copy(update={"steps": extended_steps})

    manifest = assemble_master(
        wt,
        settings.walkthroughs_dir,
        take_id=take_id,
        step_diffs=verdict.step_diffs,
        parent_take_id=parent_take,
        pr_number=pr_number,
        pr_title=pr_title,
        director_note=verdict.summary,
        status=TakeStatus.READY,
    )
    rprint(
        f"\n[green]✓[/] {take_id}: {len(manifest['segments'])} segments, "
        f"sha256={manifest['master_sha256'][:12]}…"
    )
    rprint(f"  [dim]open http://localhost:3000/takes/{take_id}[/]")


@app.command("test-agent")
def test_agent(
    fixture: str = typer.Argument(..., help="Fixture dir under tests/fixtures/"),
    walkthrough_id: str = typer.Argument("v1"),
) -> None:
    """Run the diff agent against a fixture (button_label_pr | new_screen_pr)."""
    import json as _json

    # cli.py → director/ → src/ → <project>/  (services/director/)
    fixtures_root = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
    fdir = fixtures_root / fixture
    if not fdir.exists():
        rprint(f"[red]no fixture[/]: {fdir}")
        raise typer.Exit(1)

    pr = _json.loads((fdir / "pr.json").read_text())
    diff = (fdir / "pr.diff").read_text()
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))

    verdict = run_agent(
        wt,
        diff,
        pr_title=pr.get("title", ""),
        pr_body=pr.get("body", ""),
    )

    rprint(f"\n[bold]summary[/]: {verdict.summary}\n")
    table = Table(show_header=True, header_style="bold")
    table.add_column("step")
    table.add_column("status")
    table.add_column("reason")
    for d in verdict.step_diffs:
        style = _STATUS_STYLES.get(d.status, "")
        table.add_row(d.step_id, f"[{style}]{d.status.value}[/]", d.reason)
    rprint(table)

    for d in verdict.step_diffs:
        if d.proposed_step is not None:
            rprint(f"\n[bold]{d.step_id}[/] proposed step:")
            # plain print: rich's markup parser eats `[...]` selectors otherwise
            print(d.proposed_step.model_dump_json(indent=2, exclude_none=True))


@app.command("dry-review")
def dry_review(
    fixture: str = typer.Argument(..., help="Fixture dir under tests/fixtures/"),
    walkthrough_id: str = typer.Argument("v1"),
    parent_take: str = typer.Option("master", "--parent"),
    take_id: str | None = typer.Option(None, "--take-id", help="override default take id"),
) -> None:
    """Run the agent and materialize a draft take from the verdict.

    Skips the heavyweight retake/narrate/assemble pipeline. The new take
    inherits the parent's master.mp4 and segments — what's new is the
    step_diffs metadata, which the cutroom surfaces as 'a section to retake'.
    Used to show end-to-end flow without spending capture/render time.
    """
    import json as _json
    import shutil
    from datetime import datetime, timezone

    fixtures_root = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
    fdir = fixtures_root / fixture
    if not fdir.exists():
        rprint(f"[red]no fixture[/]: {fdir}")
        raise typer.Exit(1)

    pr = _json.loads((fdir / "pr.json").read_text())
    diff = (fdir / "pr.diff").read_text()
    wt = load_walkthrough(_walkthrough_dir(walkthrough_id))

    rprint(f"[bold]dry-review[/] {fixture}: {pr.get('title', '')}")
    verdict = run_agent(
        wt, diff, pr_title=pr.get("title", ""), pr_body=pr.get("body", "")
    )
    rprint(f"\n[bold]verdict[/]: {verdict.summary}\n")
    _print_verdict_table(verdict)

    pr_number = int(pr.get("number") or 0)
    tid = take_id or (f"take-{pr_number:03d}" if pr_number else f"take-{fixture}")

    parent_dir = settings.walkthroughs_dir / wt.id / "takes" / parent_take
    take_dir = settings.walkthroughs_dir / wt.id / "takes" / tid
    if not parent_dir.exists():
        rprint(f"[red]parent take missing[/]: {parent_dir}")
        raise typer.Exit(1)
    take_dir.mkdir(parents=True, exist_ok=True)
    (take_dir / "segments").mkdir(exist_ok=True)

    # Reuse the parent master + segments byte-for-byte. The take inherits the
    # canonical video; the diff metadata is what's new.
    for name in ("master.mp4", "manifest.json"):
        src = parent_dir / name
        if src.exists():
            shutil.copy2(src, take_dir / name)
    parent_segments = parent_dir / "segments"
    if parent_segments.exists():
        for f in parent_segments.iterdir():
            if f.is_file():
                shutil.copy2(f, take_dir / "segments" / f.name)

    # Patch the manifest's take_id so the cutroom doesn't show stale.
    manifest_path = take_dir / "manifest.json"
    if manifest_path.exists():
        m = _json.loads(manifest_path.read_text())
        m["take_id"] = tid
        write_text_atomic(manifest_path, _json.dumps(m, indent=2))

    take = {
        "id": tid,
        "walkthrough_id": wt.id,
        "parent_take_id": parent_take,
        "pr_number": pr_number or None,
        "pr_title": pr.get("title", ""),
        "director_note": verdict.summary,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "ready",
        "draft": True,
        "step_diffs": [
            {
                "step_id": d.step_id,
                "status": d.status.value,
                "reason": d.reason,
                "proposed_step": (
                    d.proposed_step.model_dump(mode="json", exclude_none=True)
                    if d.proposed_step is not None
                    else None
                ),
            }
            for d in verdict.step_diffs
        ],
    }
    write_text_atomic(take_dir / "take.json", _json.dumps(take, indent=2))

    changed = sum(1 for d in verdict.step_diffs if d.status.value in ("changed", "added"))
    rprint(
        f"\n[green]✓[/] wrote {tid} (draft) — {changed} step(s) flagged for retake"
    )
    rprint(f"  [dim]open http://localhost:3000/walkthroughs/{wt.id}[/]")


if __name__ == "__main__":
    app()

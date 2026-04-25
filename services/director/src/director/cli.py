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
from .concat import assemble_master, diff_takes
from .config import settings
from .github import fetch_pr_diff, fetch_pr_meta
from .logfire_setup import configure as configure_logfire
from .models import StepDiff, StepStatus, TakeStatus
from .narrator import synth as synth_narration
from .playwright_runner import capture_step
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
    """Run every step from walkthrough.yaml: capture clip + frame + narration."""
    wt_dir = _walkthrough_dir(walkthrough_id)
    wt = load_walkthrough(wt_dir)

    table = Table(title=f"ingest · {wt.id} v{wt.version} · {len(wt.steps)} steps")
    table.add_column("step")
    table.add_column("title")
    table.add_column("clip")
    table.add_column("narration")

    for step in wt.steps:
        paths = capture_step(wt, step, settings.walkthroughs_dir, headed=headed, force=force)

        narration_status = "skipped"
        if not skip_narration:
            synth_narration(step.narration, paths["narration"], voice_id=wt.brand.voice_id)
            narration_status = f"{paths['narration'].stat().st_size}B"

        clip_status = f"{paths['clip'].stat().st_size}B" if paths["clip"].exists() else "MISSING"
        table.add_row(step.id, step.title, clip_status, narration_status)

    rprint(table)


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
    table = Table()
    table.add_column("step")
    table.add_column("status")
    table.add_column("reason")
    for d in verdict.step_diffs:
        style = _STATUS_STYLES.get(d.status, "")
        table.add_row(d.step_id, f"[{style}]{d.status.value}[/]", d.reason)
    rprint(table)

    # Retake every CHANGED/ADDED step using the proposed_step spec.
    for d in verdict.step_diffs:
        if d.status in (StepStatus.CHANGED, StepStatus.ADDED) and d.proposed_step is not None:
            capture_step(wt, d.proposed_step, settings.walkthroughs_dir, force=True)
            paths = settings.walkthroughs_dir / wt.id / "steps" / f"{d.proposed_step.id}.narration.mp3"
            synth_narration(d.proposed_step.narration, paths, voice_id=wt.brand.voice_id)
            rprint(f"  retook [yellow]{d.proposed_step.id}[/]")

    # For the master concat, we need the walkthrough Step list to reflect ADDED steps.
    extended_steps = list(wt.steps)
    for d in verdict.step_diffs:
        if d.status is StepStatus.ADDED and d.proposed_step is not None:
            extended_steps.append(d.proposed_step)
    wt = wt.model_copy(update={"steps": extended_steps})

    take_id = f"take-{pr_number:03d}"
    manifest = assemble_master(
        wt,
        settings.walkthroughs_dir,
        take_id=take_id,
        step_diffs=verdict.step_diffs,
        parent_take_id=parent_take,
        pr_number=pr_number,
        pr_title=pr_meta.get("title", ""),
        status=TakeStatus.READY,
    )
    rprint(
        f"\n[green]✓[/] {take_id}: {len(manifest['segments'])} segments, "
        f"sha256={manifest['master_sha256'][:12]}…"
    )
    rprint(f"  [dim]open http://localhost:3000/takes/{take_id}[/]")


_STATUS_STYLES = {
    StepStatus.UNCHANGED: "dim",
    StepStatus.CHANGED: "yellow",
    StepStatus.ADDED: "green",
    StepStatus.REMOVED: "red",
}


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


if __name__ == "__main__":
    app()

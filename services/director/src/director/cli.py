"""Director CLI.

  director ingest                  bake the v1 master from walkthrough.yaml
  director retake STEP_ID          re-run a single step
  director master                  concat current step artifacts → master.mp4
  director review PR_NUMBER        diff a PR and propose a new take
"""

from __future__ import annotations

import typer
from rich import print as rprint

from . import __version__
from .logfire_setup import configure as configure_logfire

app = typer.Typer(
    name="director",
    no_args_is_help=True,
    help="Foley's director — diff PRs, retake steps, assemble masters.",
)


@app.callback()
def _main() -> None:
    configure_logfire()


@app.command()
def version() -> None:
    """Print director version."""
    rprint(f"director [bold]{__version__}[/]")


@app.command()
def ingest() -> None:
    """Run every step from walkthrough.yaml and bake the v1 master."""
    rprint("[yellow]ingest[/]: not implemented yet (Phase 2/3/5)")


@app.command()
def retake(step_id: str) -> None:
    """Re-run a single step's capture and narration."""
    rprint(f"[yellow]retake[/] {step_id}: not implemented yet (Phase 2/3)")


@app.command()
def master() -> None:
    """Concat the current step artifacts into a new master.mp4."""
    rprint("[yellow]master[/]: not implemented yet (Phase 5)")


@app.command()
def review(pr_number: int) -> None:
    """Diff a PR, run the agent, retake affected steps, propose a new take."""
    rprint(f"[yellow]review[/] PR #{pr_number}: not implemented yet (Phase 4/7)")


if __name__ == "__main__":
    app()

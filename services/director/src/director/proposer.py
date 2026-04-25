"""First-draft step proposer.

Inputs:  a freshly bootstrapped Walkthrough (one stub intro step) +
         a live `dev_url` we can fetch HTML from.
Output:  a list of 4–7 grounded Steps written back to walkthrough.yaml,
         replacing the stub. The director's normal `ingest` flow then
         captures clips + narrates each one.

This is the "blank-page → first take" path — the bit a judge cloning the
repo will actually see. Reliability matters more than cleverness, so:
- We prefer goto/wait/scroll over click/fill (the latter need real selectors).
- When proposing click/hover/fill we use Playwright text-locator syntax
  (`text="Visible Label"`) which is robust to small DOM changes.
- The model is told that a slightly-generic walkthrough is far better than
  a clever one that crashes Playwright on the second step.
"""

from __future__ import annotations

import json
from pathlib import Path

import anthropic
import httpx
import yaml
from pydantic import BaseModel, ConfigDict, Field

from .atomic_io import write_text_atomic
from .config import settings
from .logfire_setup import configure as configure_logfire
from .logfire_setup import span
from .models import Step, Walkthrough

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are Foley's director, drafting the first cut of a product walkthrough video for a brand-new project.

You'll be given:
- The product's name, repo, and a short description.
- A live URL where the product is running.
- An HTML snippet from that URL (truncated; treat it as a hint, not exhaustive).

Output a sequence of 4–7 Steps that together show a first-time visitor the headline value of the product in under a minute. Submit via the `submit_steps` tool — your entire response must be that single tool call.

Each Step has:
- `id` — snake_case, unique, max 64 chars (e.g. `intro`, `sign_in`, `create_first_item`).
- `title` — 2–4 words, sentence case (e.g. "Sign in", "Your first board").
- `narration` — one or two sentences spoken naturally over the clip, 8–22 words. Plain language, present tense, no marketing speak.
- `actions` — a list of 1–3 Playwright instructions. The first step must start with `goto` to "/". Subsequent steps may stay on the same page or navigate to a new one.
- `duration_ms` — between 4000 and 9000. Match the spoken length (≈170 words per minute).

Action shapes (use these exactly):
- `goto`        — `{kind: "goto", url: "/some/path"}`. Always relative to the dev_url root.
- `wait`        — `{kind: "wait", ms: <int>}`. Use this between visible-state changes; 800–2500 ms is normal.
- `scroll`      — `{kind: "scroll", ms: <pixels>}`. ms is the wheel delta; use 400–800 to scroll down.
- `click`       — `{kind: "click", selector: "text=Visible Label"}`. ONLY use Playwright text-locator syntax (`text="..."`) — no CSS, no XPath. Only click labels you can clearly see in the HTML snippet.
- `fill`        — `{kind: "fill", selector: "input[type='email']", value: "demo@example.com"}`. Avoid unless you can see an obvious form input.
- `hover`       — `{kind: "hover", selector: "text=..."}`. Same rule as click.
- `press`       — `{kind: "press", value: "Enter"}`. After a fill.

Reliability rules — non-negotiable:
1. EVERY step's actions list must end with at least one `wait` so the camera holds long enough for the narration. If a step has only one action, make it a `wait`.
2. The intro step uses ONLY `{goto: "/"}` + `{wait: ~3500ms}`. No clicks. The camera lingers on the landing page while the narration plays.
3. Prefer goto/wait/scroll over click. A static walkthrough that captures cleanly beats a clever one that crashes on a missing selector.
4. If you don't see clearly clickable labels in the HTML snippet, DO NOT invent click selectors. Use goto to navigate by URL instead, or stay on the same page with scroll + wait.
5. Pick step titles + narration that read well even if the screen behind them is a generic landing page. The judge will see the proposed steps before any clip is captured.

Narration style:
- Friendly, calm, second person where natural. ("Here's what you see when you open the app." "Click any item to dive in.")
- Lead the eye. Mention the thing on screen by name when possible.
- One brand of energy across all steps. No emojis, no exclamations, no hedging.

The Walkthrough id, brand, and target_app stay as-is — you're only writing `steps`."""


class ProposedSteps(BaseModel):
    """Wrapper for the proposer's tool-call output."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(
        description="One sentence describing the walkthrough's narrative arc."
    )
    steps: list[Step] = Field(
        min_length=3,
        max_length=8,
        description="The proposed Steps. 3–8 entries; the first must be a goto+wait intro.",
    )


def _proposed_steps_tool_schema() -> dict:
    schema = ProposedSteps.model_json_schema()
    if "$defs" in schema:
        schema["definitions"] = schema.pop("$defs")
        as_str = json.dumps(schema)
        as_str = as_str.replace("#/$defs/", "#/definitions/")
        schema = json.loads(as_str)
    return schema


def _fetch_html_snippet(dev_url: str, *, max_chars: int = 8000) -> str:
    """Best-effort fetch of the landing page so the model can ground actions
    in real labels. We don't fail if the dev server is offline — the model
    still produces a useful generic walkthrough from name + description."""
    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as client:
            r = client.get(dev_url)
            r.raise_for_status()
            text = r.text
    except Exception as exc:  # noqa: BLE001 — best-effort
        return f"<!-- could not fetch {dev_url}: {exc} -->"
    if len(text) <= max_chars:
        return text
    # Keep the head + the start of the body — that's where most labels live.
    head_end = text.find("</head>")
    head = text[: head_end + 7] if head_end > 0 else ""
    rest_budget = max_chars - len(head)
    body_start = text.find("<body")
    body = text[body_start : body_start + max(0, rest_budget)] if body_start > 0 else text[:rest_budget]
    return head + "\n<!-- truncated -->\n" + body


def propose_steps(
    walkthrough: Walkthrough,
    *,
    description: str = "",
    dev_url: str | None = None,
) -> ProposedSteps:
    """Run the proposer. Pure function — does not touch disk."""
    configure_logfire()
    settings.require("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    target_url = dev_url or walkthrough.target_app.dev_url
    html_snippet = _fetch_html_snippet(target_url)

    parts: list[str] = []
    parts.append(f"Product: {walkthrough.display_name or walkthrough.id}")
    parts.append(f"Repo: {walkthrough.target_app.repo}")
    if description:
        parts.append(f"Description: {description}")
    parts.append(f"Dev URL: {target_url}")
    parts.append("")
    parts.append("Landing-page HTML snippet (truncated):")
    parts.append("```html")
    parts.append(html_snippet)
    parts.append("```")
    parts.append(
        "Draft the walkthrough now. Submit via `submit_steps` — every action must use one of the seven kinds, and the first step must be goto+wait."
    )
    user_content = "\n".join(parts)

    tool = {
        "name": "submit_steps",
        "description": (
            "Submit the proposed list of Steps for this walkthrough. "
            "The Walkthrough's id, brand, and target_app stay unchanged."
        ),
        "input_schema": _proposed_steps_tool_schema(),
    }

    with span(
        "proposer.propose_steps",
        walkthrough_id=walkthrough.id,
        dev_url=target_url,
        html_chars=len(html_snippet),
    ):
        response = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[tool],
            tool_choice={"type": "auto"},
            messages=[{"role": "user", "content": user_content}],
        )

    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if not tool_blocks:
        raise RuntimeError(
            f"proposer did not call submit_steps; stop_reason={response.stop_reason}"
        )
    proposed = ProposedSteps.model_validate(tool_blocks[0].input)

    # Belt-and-braces: enforce the "first step starts with goto" rule even
    # if the model drifts. If it's wrong we surface a clean error rather
    # than silently corrupting the YAML.
    first = proposed.steps[0]
    if not first.actions or first.actions[0].kind.value != "goto":
        raise RuntimeError(
            f"proposer's first step must start with goto, got {first.actions[0].kind.value if first.actions else 'no actions'}"
        )

    return proposed


def write_proposed_steps(
    walkthrough_dir: Path,
    proposed: ProposedSteps,
) -> None:
    """Replace `steps:` in walkthrough.yaml with the proposed list, in place.

    We deliberately load the YAML as a plain dict (not via the Walkthrough
    pydantic model) so we don't lose any keys we don't know about — the
    bootstrap route writes a `default_branch` field on target_app, for example.
    """
    yaml_path = walkthrough_dir / "walkthrough.yaml"
    raw = yaml.safe_load(yaml_path.read_text())
    if not isinstance(raw, dict):
        raise RuntimeError(f"{yaml_path} is not a YAML mapping")

    raw["steps"] = [s.model_dump(mode="json", exclude_none=True) for s in proposed.steps]

    new_text = (
        "# Auto-drafted by Foley's first-cut proposer. Edit any step in the studio "
        "or rerun `director propose-steps <id>` to redraft.\n"
        + yaml.safe_dump(raw, sort_keys=False, width=100)
    )
    write_text_atomic(yaml_path, new_text)


__all__ = ["ProposedSteps", "propose_steps", "write_proposed_steps"]

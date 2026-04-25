"""Diff-reasoning agent.

Inputs:  prior approved Walkthrough + PR unified diff + (optional) demo-app paths.
Output:  AgentVerdict — one StepDiff per existing step plus any ADDED steps.

Surface: Anthropic Messages API, Sonnet 4.6, adaptive thinking, effort=high,
forced tool call (`submit_verdict`) with strict JSON Schema generated from
the Pydantic models. Logfire instruments every call.
"""

from __future__ import annotations

import json
from pathlib import Path

import anthropic

from .config import settings
from .logfire_setup import configure as configure_logfire
from .logfire_setup import span
from .models import AgentVerdict, StepStatus, Walkthrough

# Sonnet 4.6 is the current Sonnet — same price as 4.5, materially better at
# structured reasoning and tool use. Spec said 4.5; we upgraded to 4.6 because
# the diff-reasoning task is the hardest one we ask of the model.
MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are Foley's director — the agent that decides which steps of a product walkthrough need to be retaken after a pull request lands.

A walkthrough is a sequence of Steps. Each Step has:
- A stable `id` you must preserve.
- A `narration` (text spoken over the captured clip).
- An `actions` list (Playwright instructions: goto, click, fill, hover, wait, scroll, press).
- A `duration_ms`.

A new PR has changed some files in the product's repository. For every existing step, decide whether the PR affects what would be captured or said. Output one StepDiff per existing step, plus optionally one or more StepDiffs with status="added" if the PR introduces a new screen or flow that should become a new step.

Status meanings:
- "unchanged": the PR does not affect what this step shows or says. The cached clip and narration can be reused byte-for-byte. This is the default — most steps in most PRs are unchanged.
- "changed": the PR changes what the step shows (new copy, new layout, different selector target, different label on a clicked element). Provide `proposed_step` with the updated narration and actions. Preserve the `id`, `viewport`, and roughly the `duration_ms`.
- "added": the PR introduces a new screen or flow that the v1 walkthrough did not cover. Provide `proposed_step` with a fresh `id` (snake_case, unique), narration, actions, and duration_ms. Insert at most one or two ADDED steps — be conservative.
- "removed": the PR removes a screen or flow that an existing step relied on. The step's actions would now fail. No `proposed_step`.

Reasoning rules:
- A step is CHANGED only if the captured frame or the narration would be misleading or incorrect after the PR. Cosmetic refactors that don't affect what the user sees in this specific step → UNCHANGED.
- If a button label changes from "Mark as done" to "Ship it" and a step's actions click that button, that step is CHANGED. Update the narration to match the new wording.
- If a new route file (e.g. `src/app/inbox/page.tsx`) appears, an ADDED step showing that screen is appropriate.
- The Walkthrough id, voice, brand, and pacing never change — only step contents do.
- Be precise about WHY in `reason` — a single short sentence, demoable, no hedging.
- Use action `kind` values exactly: "goto", "click", "fill", "hover", "wait", "scroll", "press". For goto provide `url`. For click/hover provide `selector`. For fill provide `selector` and `value`. For wait provide `ms`. For press provide `value` (key name).

You must classify EVERY existing step — call the `submit_verdict` tool exactly once with all step_diffs in a single submission."""


def _verdict_tool_schema() -> dict:
    """Generate the tool's input_schema from the AgentVerdict Pydantic model.

    Strict mode requires `additionalProperties: false` on every object;
    Pydantic's `extra="forbid"` already produces that. We re-key `$defs` →
    `definitions` to stay compatible with Anthropic's tool schema validator.
    """
    schema = AgentVerdict.model_json_schema()
    if "$defs" in schema:
        schema["definitions"] = schema.pop("$defs")
        # Rewrite all $ref strings to point at the new key.
        as_str = json.dumps(schema)
        as_str = as_str.replace("#/$defs/", "#/definitions/")
        schema = json.loads(as_str)
    return schema


def _format_walkthrough(wt: Walkthrough) -> str:
    """Compact JSON of the Walkthrough for the user message."""
    return json.dumps(
        {
            "id": wt.id,
            "version": wt.version,
            "target_app": wt.target_app.model_dump(),
            "steps": [s.model_dump(exclude_none=True) for s in wt.steps],
        },
        indent=2,
    )


def review_pr(
    walkthrough: Walkthrough,
    pr_diff: str,
    *,
    pr_title: str = "",
    pr_body: str = "",
    changed_files: list[Path] | None = None,
) -> AgentVerdict:
    """Run the agent. Returns the parsed AgentVerdict."""
    configure_logfire()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_message_parts: list[str] = []
    if pr_title:
        user_message_parts.append(f"PR title: {pr_title}")
    if pr_body:
        user_message_parts.append(f"PR description:\n{pr_body}")
    user_message_parts.append("Current walkthrough (JSON):")
    user_message_parts.append("```json")
    user_message_parts.append(_format_walkthrough(walkthrough))
    user_message_parts.append("```")
    user_message_parts.append("Unified PR diff:")
    user_message_parts.append("```diff")
    user_message_parts.append(pr_diff)
    user_message_parts.append("```")
    user_message_parts.append(
        "Classify every existing step. Add new steps only if the PR introduces a screen or flow not covered. Submit via the `submit_verdict` tool."
    )
    user_content = "\n\n".join(user_message_parts)

    tool = {
        "name": "submit_verdict",
        "description": "Submit your decisions about which walkthrough steps the PR affects.",
        "input_schema": _verdict_tool_schema(),
    }

    with span(
        "agent.review_pr",
        walkthrough_id=walkthrough.id,
        pr_title=pr_title,
        diff_chars=len(pr_diff),
        steps_in=len(walkthrough.steps),
    ):
        response = client.messages.create(
            model=MODEL,
            max_tokens=16000,
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
            tool_choice={"type": "tool", "name": "submit_verdict"},
            messages=[{"role": "user", "content": user_content}],
        )

    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if not tool_blocks:
        raise RuntimeError(
            f"agent did not call submit_verdict; stop_reason={response.stop_reason}"
        )
    verdict = AgentVerdict.model_validate(tool_blocks[0].input)

    # Sanity: every existing step appears exactly once in the verdict.
    seen = {d.step_id for d in verdict.step_diffs if d.status is not StepStatus.ADDED}
    expected = {s.id for s in walkthrough.steps}
    missing = expected - seen
    if missing:
        raise RuntimeError(f"agent omitted step_diffs for: {sorted(missing)}")

    return verdict


__all__ = ["review_pr"]

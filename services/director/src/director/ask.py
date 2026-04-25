"""Ask-this-walkthrough RAG.

Inputs:  a Walkthrough + a free-form user question.
Output:  a structured AskAnswer with `answer` (one short paragraph)
         and `citations` (list of step ids the answer drew from).

The walkthrough's full narration fits comfortably in Claude's context
(typically a few hundred words), so we don't chunk or embed — we just
hand the model the full step-by-step transcript and let it cite step
ids in its response. Forced tool call keeps output structured.
"""

from __future__ import annotations

import json

import anthropic
from pydantic import BaseModel, ConfigDict, Field

from .config import settings
from .logfire_setup import configure as configure_logfire
from .logfire_setup import span
from .models import Walkthrough

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are Foley's documentation assistant. You answer questions about a product's walkthrough using the step-by-step transcript provided.

Rules:
- Answer in plain language, 1-3 short sentences. No marketing speak.
- Always cite the step ids you drew from. Each citation must match exactly one of the step ids listed in the transcript header.
- If the transcript doesn't actually answer the question, say so honestly: "The walkthrough doesn't cover X — it focuses on Y, Z." Don't invent details.
- Don't quote the transcript verbatim — paraphrase. Use the user's vocabulary where reasonable.
- One pass only — submit your answer via the `submit_answer` tool, exactly once."""


class AskAnswer(BaseModel):
    """Structured response from the ask agent."""

    model_config = ConfigDict(extra="forbid")

    answer: str = Field(
        min_length=1,
        max_length=2000,
        description="A short paragraph answering the user's question.",
    )
    citations: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="Step ids the answer references. Must exist in the walkthrough.",
    )


def _tool_schema() -> dict:
    schema = AskAnswer.model_json_schema()
    if "$defs" in schema:
        schema["definitions"] = schema.pop("$defs")
        as_str = json.dumps(schema)
        as_str = as_str.replace("#/$defs/", "#/definitions/")
        schema = json.loads(as_str)
    return schema


def _format_walkthrough(wt: Walkthrough) -> str:
    parts: list[str] = []
    parts.append(
        f"Walkthrough id: {wt.id} · target: {wt.target_app.repo} · "
        f"voice: {wt.brand.voice_name}"
    )
    parts.append(f"Step ids (use these exactly when citing): {', '.join(s.id for s in wt.steps)}")
    parts.append("")
    for i, step in enumerate(wt.steps):
        parts.append(f"--- Step {i + 1} · id: {step.id} · title: {step.title} ---")
        parts.append(step.narration)
        parts.append("")
    return "\n".join(parts)


def ask_walkthrough(walkthrough: Walkthrough, question: str) -> AskAnswer:
    """Run the ask agent. Returns the parsed AskAnswer."""
    configure_logfire()
    settings.require("ANTHROPIC_API_KEY")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    user_content = (
        "Walkthrough transcript:\n\n"
        f"{_format_walkthrough(walkthrough)}\n\n"
        f"Question: {question}\n\n"
        "Submit your answer via `submit_answer`. Cite only step ids that appear in the transcript."
    )

    tool = {
        "name": "submit_answer",
        "description": "Submit your answer + citations to the user's question.",
        "input_schema": _tool_schema(),
    }

    with span(
        "ask.ask_walkthrough",
        walkthrough_id=walkthrough.id,
        question_chars=len(question),
        steps=len(walkthrough.steps),
    ):
        response = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[tool],
            tool_choice={"type": "tool", "name": "submit_answer"},
            messages=[{"role": "user", "content": user_content}],
        )

    tool_blocks = [b for b in response.content if b.type == "tool_use"]
    if not tool_blocks:
        raise RuntimeError(
            f"ask did not call submit_answer; stop_reason={response.stop_reason}"
        )
    answer = AskAnswer.model_validate(tool_blocks[0].input)

    # Belt-and-braces: drop citations that don't match an actual step id —
    # the model is reliable but this guards against UI link-to-nothing.
    valid_ids = {s.id for s in walkthrough.steps}
    answer.citations = [c for c in answer.citations if c in valid_ids]
    return answer


__all__ = ["AskAnswer", "ask_walkthrough"]

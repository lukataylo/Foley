"""Foley domain models. Film vocabulary throughout.

Walkthrough  — the product, versioned over time.
Step         — atomic unit captured per take.
BrandConfig  — voice, palette, font, pacing.
Take         — a versioned attempt at the master.
StepDiff     — what the director said about a step relative to the prior take.
RenderJob    — work item dispatched when a PR fires the webhook.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ─── primitives ──────────────────────────────────────────────────────────────


class StepStatus(str, Enum):
    UNCHANGED = "unchanged"
    CHANGED = "changed"
    ADDED = "added"
    REMOVED = "removed"


class TakeStatus(str, Enum):
    DRAFTING = "drafting"
    READY = "ready"
    APPROVED = "approved"
    REJECTED = "rejected"


class ActionKind(str, Enum):
    GOTO = "goto"
    CLICK = "click"
    FILL = "fill"
    HOVER = "hover"
    WAIT = "wait"
    SCROLL = "scroll"
    PRESS = "press"


class Viewport(BaseModel):
    model_config = ConfigDict(frozen=True)
    width: int = 1440
    height: int = 900


class Action(BaseModel):
    """One atomic browser instruction inside a Step."""

    model_config = ConfigDict(extra="forbid")

    kind: ActionKind
    selector: str | None = None
    value: str | None = None
    url: str | None = None
    ms: int | None = Field(default=None, ge=0, le=30_000)

    @model_validator(mode="after")
    def _shape(self) -> Action:
        match self.kind:
            case ActionKind.GOTO:
                if not self.url:
                    raise ValueError("goto requires url")
            case ActionKind.CLICK | ActionKind.HOVER:
                if not self.selector:
                    raise ValueError(f"{self.kind} requires selector")
            case ActionKind.FILL:
                if not self.selector or self.value is None:
                    raise ValueError("fill requires selector and value")
            case ActionKind.WAIT:
                if self.ms is None:
                    raise ValueError("wait requires ms")
            case ActionKind.PRESS:
                if not self.value:
                    raise ValueError("press requires value (key name)")
        return self


# ─── core ────────────────────────────────────────────────────────────────────


class Step(BaseModel):
    """The atomic unit. Stable id; everything else can change.

    `narration_hash` is set when narration audio is synthesized; lets us
    short-circuit re-synthesis when the text is unchanged.
    `clip_hash` is set when the playwright clip is captured; lets the
    concat phase reuse the cached clip byte-for-byte.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_]+$", min_length=1, max_length=64)
    title: str
    narration: str
    actions: list[Action] = Field(default_factory=list, min_length=1)
    duration_ms: int = Field(ge=500, le=30_000)
    viewport: Viewport = Field(default_factory=Viewport)

    narration_hash: str | None = None
    clip_hash: str | None = None

    def fingerprint(self) -> str:
        """Stable hash of everything that affects the rendered clip.

        If two Steps have the same fingerprint, their captured clips and
        narration bytes are interchangeable. Used by the agent to detect
        "this step did not actually change."
        """
        payload = {
            "id": self.id,
            "narration": self.narration,
            "actions": [a.model_dump(exclude_none=True) for a in self.actions],
            "duration_ms": self.duration_ms,
            "viewport": self.viewport.model_dump(),
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()[:16]


class BrandConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    voice_id: str
    voice_name: str
    font_family: str = "SF Pro Text"
    palette_bg: str = "#0a0a0a"
    palette_fg: str = "#f5f5f5"
    palette_accent: str = "#ffce4a"
    pacing_wpm: int = Field(default=170, ge=120, le=220)
    intro_card_ms: int = Field(default=1500, ge=0, le=6000)


class TargetApp(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repo: str  # owner/name
    dev_url: str  # http://localhost:3001


class Walkthrough(BaseModel):
    """The canonical, versioned spec. Loaded from walkthrough.yaml + brand.yaml."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    version: int = Field(ge=1)
    target_app: TargetApp
    brand: BrandConfig
    steps: list[Step] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_step_ids(self) -> Walkthrough:
        ids = [s.id for s in self.steps]
        if len(set(ids)) != len(ids):
            dupes = sorted({i for i in ids if ids.count(i) > 1})
            raise ValueError(f"duplicate step ids: {dupes}")
        return self

    def step(self, step_id: str) -> Step:
        for s in self.steps:
            if s.id == step_id:
                return s
        raise KeyError(step_id)


# ─── diffing & takes ─────────────────────────────────────────────────────────


class StepDiff(BaseModel):
    """The director's verdict on one step, relative to the prior take."""

    model_config = ConfigDict(extra="forbid")

    step_id: str
    status: StepStatus
    reason: str = Field(
        description="Short, demoable explanation of why this step was classified this way."
    )
    proposed_step: Step | None = Field(
        default=None,
        description="Set when status is CHANGED or ADDED — the new spec for the step.",
    )

    @model_validator(mode="after")
    def _shape(self) -> StepDiff:
        if self.status in (StepStatus.CHANGED, StepStatus.ADDED) and self.proposed_step is None:
            raise ValueError(f"{self.status} requires proposed_step")
        if self.status == StepStatus.UNCHANGED and self.proposed_step is not None:
            raise ValueError("unchanged must not carry proposed_step")
        return self


class Take(BaseModel):
    """A versioned attempt at the master.

    `master` is the take that the human approved. Subsequent takes diff
    against the most recent approved master.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    walkthrough_id: str
    parent_take_id: str | None = None
    pr_number: int | None = None
    pr_title: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: TakeStatus = TakeStatus.DRAFTING
    step_diffs: list[StepDiff] = Field(default_factory=list)
    master_path: str | None = None  # relative to walkthroughs/<id>/takes/<take_id>/

    def changed_step_ids(self) -> list[str]:
        return [
            d.step_id
            for d in self.step_diffs
            if d.status in (StepStatus.CHANGED, StepStatus.ADDED)
        ]


# ─── job dispatch ────────────────────────────────────────────────────────────


class RenderJob(BaseModel):
    """Work item the cutroom enqueues when the webhook fires."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["review_pr", "ingest", "retake"] = "review_pr"
    walkthrough_id: str
    pr_number: int | None = None
    step_ids: list[str] = Field(default_factory=list)  # for retake
    enqueued_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── on-disk paths ───────────────────────────────────────────────────────────


def step_artifact_paths(walkthroughs_dir: Path, walkthrough_id: str, step_id: str) -> dict[str, Path]:
    base = walkthroughs_dir / walkthrough_id / "steps"
    return {
        "clip": base / f"{step_id}.mp4",
        "frame": base / f"{step_id}.png",
        "narration": base / f"{step_id}.narration.mp3",
        "meta": base / f"{step_id}.meta.json",
    }


def take_dir(walkthroughs_dir: Path, walkthrough_id: str, take_id: str) -> Path:
    return walkthroughs_dir / walkthrough_id / "takes" / take_id


# Re-exports for cleaner imports.
StepID = Annotated[str, Field(pattern=r"^[a-z0-9_]+$")]
__all__ = [
    "Action",
    "ActionKind",
    "BrandConfig",
    "RenderJob",
    "Step",
    "StepDiff",
    "StepID",
    "StepStatus",
    "Take",
    "TakeStatus",
    "TargetApp",
    "Viewport",
    "Walkthrough",
    "step_artifact_paths",
    "take_dir",
]

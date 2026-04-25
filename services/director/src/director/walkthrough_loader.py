"""Load walkthrough.yaml + brand.yaml into a Walkthrough model."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import ValidationError

from .models import Walkthrough


class WalkthroughLoadError(RuntimeError):
    """Surfaces walkthrough.yaml / brand.yaml validation problems with a
    UI-friendly message. Route handlers detect the `WALKTHROUGH_LOAD_ERROR:`
    prefix in stderr and turn the error into HTTP 422 with `message` set.
    """

    def __init__(self, *, path: Path, message: str, hint: str | None = None):
        self.path = path
        self.message = message
        self.hint = hint
        prefix = f"WALKTHROUGH_LOAD_ERROR: {message}"
        if hint:
            prefix = f"{prefix} ({hint})"
        super().__init__(prefix)


def _format_pydantic_errors(exc: ValidationError) -> tuple[str, str]:
    """Turn a Pydantic ValidationError into (one-line message, hint).

    We surface the first two errors — judges editing YAML by hand usually
    only have one or two issues, and a long list buried in a banner is
    noise. Stays grounded by quoting the input value where present.
    """
    errors = exc.errors()
    if not errors:
        return ("Schema validation failed.", None)
    first = errors[0]
    loc = ".".join(str(p) for p in first.get("loc", []))
    err_type = first.get("type", "")
    if err_type == "extra_forbidden":
        return (
            f"Unknown field `{loc}` is not allowed.",
            "Remove it or fix the typo — see services/director/src/director/models.py for the schema.",
        )
    if err_type.startswith("missing"):
        return (
            f"Required field `{loc}` is missing.",
            "Add it to walkthrough.yaml.",
        )
    msg = first.get("msg", "invalid value")
    return (f"`{loc}`: {msg}", None)


def load_walkthrough(walkthrough_dir: Path) -> Walkthrough:
    """Load walkthrough.yaml + brand.yaml from a directory.

    The directory name is the source of truth for the walkthrough id —
    artifacts and takes live under it. The YAML may not redefine `id`.

    walkthrough.yaml may set `brand_ref: brand.yaml`; we resolve it relative
    to the same directory and inline it as `brand` before validating.
    """
    walkthrough_path = walkthrough_dir / "walkthrough.yaml"
    if not walkthrough_path.exists():
        raise WalkthroughLoadError(
            path=walkthrough_path,
            message=f"walkthrough.yaml not found under {walkthrough_dir}.",
            hint="Onboard via the studio or hand-edit walkthrough.yaml.",
        )

    try:
        raw = yaml.safe_load(walkthrough_path.read_text())
    except yaml.YAMLError as exc:
        raise WalkthroughLoadError(
            path=walkthrough_path,
            message=f"walkthrough.yaml has invalid YAML syntax: {exc!s}",
            hint="Fix the syntax error and reload.",
        ) from exc

    if not isinstance(raw, dict):
        raise WalkthroughLoadError(
            path=walkthrough_path,
            message="walkthrough.yaml must be a YAML mapping (object), not a list or scalar.",
        )

    brand_ref = raw.pop("brand_ref", None)
    if brand_ref:
        brand_path = walkthrough_dir / brand_ref
        if not brand_path.exists():
            raise WalkthroughLoadError(
                path=walkthrough_path,
                message=f"brand_ref points to {brand_ref} but that file does not exist.",
                hint="Either create the referenced file or remove the brand_ref line.",
            )
        try:
            raw["brand"] = yaml.safe_load(brand_path.read_text())
        except yaml.YAMLError as exc:
            raise WalkthroughLoadError(
                path=brand_path,
                message=f"brand file {brand_ref} has invalid YAML syntax: {exc!s}",
            ) from exc

    raw["id"] = walkthrough_dir.name

    try:
        return Walkthrough.model_validate(raw)
    except ValidationError as exc:
        message, hint = _format_pydantic_errors(exc)
        raise WalkthroughLoadError(
            path=walkthrough_path,
            message=message,
            hint=hint,
        ) from exc


__all__ = ["load_walkthrough", "WalkthroughLoadError"]

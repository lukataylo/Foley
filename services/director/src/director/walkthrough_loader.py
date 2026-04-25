"""Load walkthrough.yaml + brand.yaml into a Walkthrough model."""

from __future__ import annotations

from pathlib import Path

import yaml

from .models import Walkthrough


def load_walkthrough(walkthrough_dir: Path) -> Walkthrough:
    """Load walkthrough.yaml + brand.yaml from a directory.

    The directory name is the source of truth for the walkthrough id —
    artifacts and takes live under it. The YAML may not redefine `id`.

    walkthrough.yaml may set `brand_ref: brand.yaml`; we resolve it relative
    to the same directory and inline it as `brand` before validating.
    """
    walkthrough_path = walkthrough_dir / "walkthrough.yaml"
    raw = yaml.safe_load(walkthrough_path.read_text())

    brand_ref = raw.pop("brand_ref", None)
    if brand_ref:
        brand_path = walkthrough_dir / brand_ref
        raw["brand"] = yaml.safe_load(brand_path.read_text())

    raw["id"] = walkthrough_dir.name

    return Walkthrough.model_validate(raw)

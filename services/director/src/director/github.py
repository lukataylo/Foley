"""GitHub PR diff fetch + webhook signature verification.

Uses the `gh` CLI for diff fetching — already authenticated on dev machines,
no token plumbing needed for the hackathon.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import subprocess

from .config import settings


def fetch_pr_diff(pr_number: int, repo: str | None = None) -> str:
    """Return the unified diff for a PR via the `gh` CLI."""
    repo = repo or settings.demo_app_repo
    proc = subprocess.run(
        ["gh", "pr", "diff", str(pr_number), "-R", repo],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gh pr diff failed: {proc.stderr.strip()}")
    return proc.stdout


def fetch_pr_meta(pr_number: int, repo: str | None = None) -> dict:
    """Return PR metadata (title, body, head ref) via the `gh` CLI."""
    repo = repo or settings.demo_app_repo
    proc = subprocess.run(
        [
            "gh", "pr", "view", str(pr_number), "-R", repo,
            "--json", "title,body,headRefName,headRefOid,number,state",
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gh pr view failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def verify_webhook(secret: str, signature_header: str, body: bytes) -> bool:
    """Verify GitHub's X-Hub-Signature-256 against the body."""
    if not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)


__all__ = ["fetch_pr_diff", "fetch_pr_meta", "verify_webhook"]

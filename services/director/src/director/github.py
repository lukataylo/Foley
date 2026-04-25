"""GitHub PR diff fetch + webhook signature verification.

Implementation lands in Phase 7.
"""

from __future__ import annotations

__all__ = ["fetch_pr_diff", "verify_webhook"]


def fetch_pr_diff(*args, **kwargs):  # noqa: ARG001
    raise NotImplementedError("Phase 7: fetch PR diff via GitHub API.")


def verify_webhook(*args, **kwargs):  # noqa: ARG001
    raise NotImplementedError("Phase 7: verify X-Hub-Signature-256.")

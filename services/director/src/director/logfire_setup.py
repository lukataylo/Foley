"""Configure Logfire once. Safe to import multiple times."""

from __future__ import annotations

import os

import logfire

from .config import settings

_configured = False


def configure() -> None:
    global _configured
    if _configured:
        return
    token = settings.logfire_token or os.getenv("LOGFIRE_TOKEN", "")
    if token:
        logfire.configure(token=token, service_name="foley-director")
    else:
        # No token: still configure so spans print locally to stderr.
        logfire.configure(service_name="foley-director", send_to_logfire=False)
    logfire.instrument_pydantic()
    try:
        logfire.instrument_anthropic()
    except Exception:
        # Older logfire versions don't have this; spans still wrap calls manually.
        pass
    _configured = True


def span(name: str, **attrs):
    configure()
    return logfire.span(name, **attrs)

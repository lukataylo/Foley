#!/usr/bin/env bash
# Typecheck both sides — TS via tsc and Python via import smoke.
# Runs without a live server.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 00 typecheck ─────────────────────────────────────────────────"

# 1. Cutroom TypeScript.
if (cd "$ROOT/apps/cutroom" && pnpm typecheck) >/dev/null 2>&1; then
  pass "cutroom tsc --noEmit clean"
else
  fail "cutroom tsc --noEmit reported errors"
fi

# 2. Director Python imports.
PY_CMD='from director import (
  agent, ask, atomic_io, bake_master, captions, checker, cli, concat,
  config, continuous_narration, github, logfire_setup, models, narrator,
  playwright_runner, proposer, walkthrough_loader, waveform
)
print("ok")'
if PYTHONPATH="$ROOT/services/director/src" \
    uv --directory "$ROOT/services/director" run python -c "$PY_CMD" >/dev/null 2>&1; then
  pass "director imports clean"
else
  fail "director imports failed (run manually for the traceback)"
fi

summary

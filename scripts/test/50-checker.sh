#!/usr/bin/env bash
# Director CLI — `director check v1 --no-network` should succeed against
# the seeded walkthrough.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 50 checker ───────────────────────────────────────────────────"

# 1. v1 should pass cleanly (no errors → exit 0).
if PYTHONPATH="$ROOT/services/director/src" \
    uv --directory "$ROOT/services/director" run director check v1 --no-network \
    >/tmp/foley-check-v1.log 2>&1; then
  pass "director check v1 → exit 0"
else
  ec=$?
  if [[ "$ec" == "2" ]]; then
    pass "director check v1 → exit 2 (warnings only, no errors)"
  else
    fail "director check v1 → exit $ec (expected 0 or 2). Tail: $(tail -5 /tmp/foley-check-v1.log)"
  fi
fi

# 2. captions, propose-steps, ask, check are all registered.
# Note: avoid `grep -q` here — it closes stdin on first match, and with
# `pipefail` the upstream `uv` exits non-zero from the resulting SIGPIPE
# even though grep itself succeeded. Using `-c` keeps the pipeline drained.
help_hit_count=$(PYTHONPATH="$ROOT/services/director/src" \
    uv --directory "$ROOT/services/director" run director --help 2>&1 \
    | grep -cE 'check|captions|propose-steps|ask|synth-continuous')
if [[ "$help_hit_count" -ge 5 ]]; then
  pass "director CLI registers all overnight commands ($help_hit_count hits)"
else
  fail "director CLI missing commands: only matched $help_hit_count of 5"
fi

# 3. atomic_io smoke — Python helpers are import-clean and round-trip.
PY_SMOKE='from pathlib import Path
import json
import tempfile
from director.atomic_io import write_text_atomic, write_bytes_atomic, write_json_atomic
with tempfile.TemporaryDirectory() as d:
    p = Path(d) / "x.json"
    write_json_atomic(p, {"k": 1})
    assert json.loads(p.read_text()) == {"k": 1}
    write_text_atomic(p, "abc")
    assert p.read_text() == "abc"
    write_bytes_atomic(p, b"\\x00\\x01")
    assert p.read_bytes() == b"\\x00\\x01"
    siblings = [x for x in Path(d).iterdir() if x.name != "x.json"]
    assert siblings == [], siblings
print("ok")'
if PYTHONPATH="$ROOT/services/director/src" \
    uv --directory "$ROOT/services/director" run python -c "$PY_SMOKE" >/dev/null 2>&1; then
  pass "atomic_io round-trips clean (no leftover tempfiles)"
else
  fail "atomic_io smoke failed"
fi

summary

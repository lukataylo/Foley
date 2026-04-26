#!/usr/bin/env bash
# AI smoke — `Ask this walkthrough` round-trip. Costs ~$0.02 in Anthropic
# credits per run. Skip with SKIP_AI=1.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 40 ai ────────────────────────────────────────────────────────"

if [[ "${SKIP_AI:-0}" == "1" ]]; then
  skip "SKIP_AI=1 — not calling Anthropic"
  summary
  exit 0
fi

# 1. Empty question is rejected.
got=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE}/api/walkthroughs/v1/ask" \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 5 2>/dev/null || true)
if [[ "$got" == "400" ]]; then
  pass "ask rejects empty question"
else
  fail "ask should 400 on empty body (got $got)"
fi

# 2. Real Q → real A with at least one citation.
body=$(curl -s -X POST "${BASE}/api/walkthroughs/v1/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"How do I mark a ticket as done?"}' \
  --max-time 60 2>/dev/null || true)

if [[ "$body" == *'"ok":true'* ]]; then
  pass "ask returned ok:true"
else
  fail "ask did not return ok:true (got: $(printf '%s' "$body" | head -c 200))"
  summary
  exit 1
fi

if [[ "$body" == *'"citations"'* && "$body" == *'"answer"'* ]]; then
  pass "ask response carries answer + citations"
else
  fail "ask response missing citations or answer"
fi

# 3. Citation should reference an actual step id.
if [[ "$body" == *'"mark_done"'* ]]; then
  pass "ask cited \`mark_done\` for the relevant question"
else
  note "ask answered without citing mark_done — model may have rephrased; not failing"
fi

summary

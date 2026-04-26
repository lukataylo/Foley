#!/usr/bin/env bash
# Layer 80 — Playwright UI smoke against the running dev server. Covers
# the onboarding wizard end-to-end: paste-a-URL flow, error states,
# step-1→step-2 advancement when keys are configured.
#
# Skips itself entirely if Chromium isn't on disk (CI without
# `playwright install` shouldn't fail this layer hard) — the e2e tests
# themselves auto-skip when API keys aren't configured.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 80 ui (playwright) ──────────────────────────────────────────"

# Sanity: dev server is reachable.
if ! curl -s -o /dev/null --max-time 3 "${BASE}/" 2>/dev/null; then
  fail "dev server unreachable at $BASE — start \`pnpm dev\` first"
  summary
  exit 1
fi

# Sanity: chromium has been installed by playwright (either via the
# director's playwright install, or via @playwright/test's first run).
PLAYWRIGHT_CACHE="${HOME}/Library/Caches/ms-playwright"
if [[ ! -d "$PLAYWRIGHT_CACHE" ]]; then
  PLAYWRIGHT_CACHE="${HOME}/.cache/ms-playwright"
fi
if [[ ! -d "$PLAYWRIGHT_CACHE" ]] || ! ls -d "$PLAYWRIGHT_CACHE"/chromium* >/dev/null 2>&1; then
  skip "playwright chromium not installed — run \`pnpm --filter cutroom exec playwright install chromium\`"
  summary
  exit 0
fi

# Run the suite. Pipe through a filter so the lib's pass/fail counters
# stay roughly in sync with the test report.
LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT
if PLAYWRIGHT_BASE_URL="$BASE" pnpm --filter cutroom test:e2e --reporter=line >"$LOG" 2>&1; then
  # Playwright's line reporter prints `  N passed (Ns)` on the final line.
  # ANSI escapes can prefix it; strip them before counting.
  passed=$(sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$LOG" \
    | grep -oE "[0-9]+ passed" | tail -1 | awk '{print $1}')
  pass "playwright e2e: ${passed:-?} test(s) passed"
else
  fail "playwright e2e failed (tail below)"
  tail -30 "$LOG"
fi

summary
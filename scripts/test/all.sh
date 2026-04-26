#!/usr/bin/env bash
# Foley smoke-test runner.
# Runs every layer in scripts/test/ and aggregates the pass/fail.
#
#   bash scripts/test/all.sh
#   SKIP_AI=1 bash scripts/test/all.sh         # skip Anthropic-billing layer
#   BASE=https://foley.example.com bash …      # point at a deployed instance
#
# Each layer is independent; a failure in 30-onboard doesn't skip 40-ai.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -t 1 ]]; then
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RESET=$'\033[0m'
else
  C_BOLD=""
  C_DIM=""
  C_RESET=""
fi

LAYERS=(
  "00-typecheck.sh"
  "10-routes.sh"
  "20-apis.sh"
  "30-onboard.sh"
  "40-ai.sh"
  "50-checker.sh"
  "60-fs.sh"
  "70-keys-mcp.sh"
  "80-ui.sh"
)

declare -a LAYER_RESULTS
TOTAL_FAILED=0

printf '%sFoley test suite%s · target %s%s%s\n\n' \
  "$C_BOLD" "$C_RESET" "$C_DIM" "${BASE:-http://localhost:3000}" "$C_RESET"

for layer in "${LAYERS[@]}"; do
  if [[ -x "$SCRIPT_DIR/$layer" || -f "$SCRIPT_DIR/$layer" ]]; then
    bash "$SCRIPT_DIR/$layer"
    rc=$?
  else
    echo "── $layer ──── (missing) ──"
    rc=1
  fi
  LAYER_RESULTS+=("$layer:$rc")
  if [[ "$rc" -ne 0 ]]; then
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
  echo
done

echo "════════════════════════════════════════════════════════════════"
printf '%ssummary%s\n' "$C_BOLD" "$C_RESET"
for r in "${LAYER_RESULTS[@]}"; do
  layer="${r%%:*}"
  rc="${r##*:}"
  if [[ "$rc" == "0" ]]; then
    printf '  ✓ %s\n' "$layer"
  else
    printf '  ✗ %s (rc=%s)\n' "$layer" "$rc"
  fi
done
echo
if (( TOTAL_FAILED == 0 )); then
  printf '%sall layers passed%s\n' "$C_BOLD" "$C_RESET"
  exit 0
fi
printf '%s%d layer(s) failed%s\n' "$C_BOLD" "$TOTAL_FAILED" "$C_RESET"
exit 1

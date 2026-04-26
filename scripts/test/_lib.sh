# Shared helpers for the Foley smoke-test suite.
# Sourced by every layer; never run on its own.

set -uo pipefail

BASE="${BASE:-http://localhost:3000}"

PASS_COUNT=0
FAIL_COUNT=0
FAIL_LINES=()

# ANSI colours when stdout is a TTY.
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_DIM=$'\033[2m'
  C_RESET=$'\033[0m'
else
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_DIM=""
  C_RESET=""
fi

pass() {
  printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  printf '  %s✗%s %s\n' "$C_RED" "$C_RESET" "$1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAIL_LINES+=("$1")
}

skip() {
  printf '  %s·%s %s\n' "$C_DIM" "$C_RESET" "$1"
}

note() {
  printf '  %s%s%s\n' "$C_DIM" "$1" "$C_RESET"
}

# assert_status <expected> <url> [METHOD]
# Pass: HTTP status matches expected.
assert_status() {
  local expected="$1"
  local url="$2"
  local method="${3:-GET}"
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${BASE}${url}" --max-time 10 2>/dev/null || true)
  if [[ "$got" == "$expected" ]]; then
    pass "$method $url → $got"
  else
    fail "$method $url → $got (expected $expected)"
  fi
}

# assert_json_field <url> <jq filter> <expected>
# Used to spot-check API response shapes without pulling in a JSON tool —
# we just grep for the key:value substring.
assert_json_contains() {
  local url="$1"
  local needle="$2"
  local body
  body=$(curl -s "${BASE}${url}" --max-time 15 2>/dev/null || true)
  if [[ "$body" == *"$needle"* ]]; then
    pass "GET $url contains \`$needle\`"
  else
    fail "GET $url missing \`$needle\` (body: $(printf '%s' "$body" | head -c 200))"
  fi
}

# assert_post_ok <url> <json body>
# POST returns ok:true (200/201).
assert_post_ok() {
  local url="$1"
  local body="$2"
  local got
  got=$(curl -s -X POST "${BASE}${url}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --max-time 60 2>/dev/null || true)
  if [[ "$got" == *'"ok":true'* ]]; then
    pass "POST $url ok"
  else
    fail "POST $url did not return ok:true (body: $(printf '%s' "$got" | head -c 200))"
  fi
}

# Summary at exit. Each layer calls `summary` at the end.
summary() {
  echo
  if (( FAIL_COUNT == 0 )); then
    printf '%s%d passed%s · 0 failed\n' "$C_GREEN" "$PASS_COUNT" "$C_RESET"
    return 0
  fi
  printf '%s%d failed%s · %d passed\n' "$C_RED" "$FAIL_COUNT" "$C_RESET" "$PASS_COUNT"
  for line in "${FAIL_LINES[@]}"; do
    printf '  %s· %s%s\n' "$C_RED" "$line" "$C_RESET"
  done
  return 1
}

#!/usr/bin/env bash
# Onboarding lifecycle: bootstrap → propose-steps (skipped to save credits) →
# add-step → reorder → cleanup. Confirms the editor can extend a walkthrough
# without burning paid API credits.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 30 onboard ───────────────────────────────────────────────────"

SLUG="smoke-$$"

cleanup() {
  rm -rf "$ROOT/walkthroughs/$SLUG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 1. Bootstrap. Returns id + href.
boot=$(curl -s -X POST "${BASE}/api/onboard/bootstrap" \
  -H "Content-Type: application/json" \
  -d "{\"full_name\":\"smoke/${SLUG}\",\"default_branch\":\"main\",\"description\":\"smoke\",\"dev_url\":\"http://localhost:3000\"}" \
  --max-time 10 2>/dev/null || true)

if [[ "$boot" == *"\"href\":\"/walkthroughs/${SLUG}/edit\""* ]]; then
  pass "bootstrap returned the editor href"
else
  fail "bootstrap returned unexpected: $(printf '%s' "$boot" | head -c 200)"
  summary
  exit 1
fi

# 2. Bootstrapped scaffold has the expected files.
if [[ -f "$ROOT/walkthroughs/${SLUG}/walkthrough.yaml" ]]; then
  pass "walkthrough.yaml on disk"
else
  fail "walkthrough.yaml not written"
fi
if [[ -f "$ROOT/walkthroughs/${SLUG}/brand.yaml" ]]; then
  pass "brand.yaml on disk"
else
  fail "brand.yaml not written"
fi

# 3. Add-step appends.
assert_post_ok "/api/walkthroughs/${SLUG}/steps" '{}'
assert_post_ok "/api/walkthroughs/${SLUG}/steps" '{"title":"Manual","narration":"Hello"}'

# 4. Reorder swaps positions.
assert_post_ok "/api/walkthroughs/${SLUG}/steps/reorder" '{"ids":["step_3","step_2","intro"]}'

# 5. Reorder rejects mismatched id sets.
got=$(curl -s -X POST "${BASE}/api/walkthroughs/${SLUG}/steps/reorder" \
  -H "Content-Type: application/json" \
  -d '{"ids":["step_3","intro"]}' \
  --max-time 5 2>/dev/null || true)
if [[ "$got" == *'"reorder_failed"'* ]]; then
  pass "reorder rejects mismatched ids"
else
  fail "reorder should refuse incomplete id sets (got: $(printf '%s' "$got" | head -c 160))"
fi

# 6. /walkthroughs/<id>/edit and /walkthroughs/<id> both render.
assert_status 200 "/walkthroughs/${SLUG}/edit"
assert_status 200 "/walkthroughs/${SLUG}"

# 7. Bootstrap rejects missing full_name.
got=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/onboard/bootstrap" \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 5 2>/dev/null || true)
if [[ "$got" == "400" ]]; then
  pass "bootstrap rejects missing full_name"
else
  fail "bootstrap should 400 on empty body (got $got)"
fi

# 8. /api/github/resolve — paste-a-URL flow.
# Bad URL → 400.
got=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE}/api/github/resolve?url=not-a-url" --max-time 5 2>/dev/null || true)
if [[ "$got" == "400" ]]; then
  pass "/api/github/resolve rejects bogus URL"
else
  fail "/api/github/resolve should 400 on bogus URL (got $got)"
fi

# Live GitHub call — only attempted if network reachable. Uses the canonical
# octocat/Hello-World repo (14 years old, the GitHub demo repo).
if curl -s -o /dev/null --max-time 3 "https://api.github.com/zen" 2>/dev/null; then
  body=$(curl -s "${BASE}/api/github/resolve?url=https%3A%2F%2Fgithub.com%2Foctocat%2FHello-World" \
    --max-time 10 2>/dev/null || true)
  if [[ "$body" == *'"full_name":"octocat/Hello-World"'* ]]; then
    pass "/api/github/resolve resolves octocat/Hello-World"
  else
    fail "octocat/Hello-World did not resolve cleanly (body: $(printf '%s' "$body" | head -c 200))"
  fi

  # Non-existent repo → fallback path with bare metadata.
  body=$(curl -s "${BASE}/api/github/resolve?url=https%3A%2F%2Fgithub.com%2Fnobody-12345%2Fnobody-repo-xyz-abc" \
    --max-time 10 2>/dev/null || true)
  if [[ "$body" == *'"fallback":true'* ]]; then
    pass "/api/github/resolve falls back gracefully on 404"
  else
    fail "404 path did not return fallback:true (body: $(printf '%s' "$body" | head -c 200))"
  fi
else
  skip "github.com unreachable — skipping live resolve checks"
fi

summary

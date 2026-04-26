#!/usr/bin/env bash
# Public page + AI / SEO surface coverage. Every URL a judge could plausibly
# hit returns the right status code.
#
# Requires `pnpm dev` already running on $BASE (default http://localhost:3000).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 10 routes ────────────────────────────────────────────────────"

# Public-page routes.
assert_status 200 /
assert_status 200 /welcome
assert_status 200 /onboard
assert_status 200 /walkthroughs/v1
assert_status 200 /walkthroughs/v1/edit
assert_status 200 /walkthroughs/foley
assert_status 200 /walkthroughs/foley/edit
assert_status 200 /takes/master
assert_status 200 /docs/v1
assert_status 200 /docs/foley

# Markdown export rewrite.
assert_status 200 /docs/v1.md
assert_status 200 /docs/foley.md

# AI / discovery surfaces.
assert_status 200 /llms.txt
assert_status 200 /skill.md
assert_status 200 /sitemap.xml
assert_status 200 /robots.txt
assert_status 200 /api/mcp

# Custom 404.
assert_status 404 /this-page-does-not-exist

# Webhook GET probe.
assert_status 200 /api/webhook/github

# Webhook POST should refuse without GITHUB_WEBHOOK_SECRET.
got=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE}/api/webhook/github" \
  -H "Content-Type: application/json" \
  -d '{}' --max-time 5 2>/dev/null || true)
if [[ "$got" == "503" || "$got" == "401" ]]; then
  pass "POST /api/webhook/github → $got (refuses without secret)"
else
  fail "POST /api/webhook/github → $got (expected 503 or 401)"
fi

summary

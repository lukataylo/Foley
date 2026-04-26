#!/usr/bin/env bash
# Public API contract coverage — every endpoint returns the right shape.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 20 apis ──────────────────────────────────────────────────────"

# Preflight.
assert_status 200 /api/preflight
assert_json_contains /api/preflight '"id":"ffmpeg"'
assert_json_contains /api/preflight '"id":"playwright_chromium"'

# Captions.
assert_status 200 /api/walkthroughs/v1/captions
assert_json_contains /api/walkthroughs/v1/captions WEBVTT

# Transcript.
assert_status 200 /api/walkthroughs/v1/transcript
assert_json_contains /api/walkthroughs/v1/transcript '"cues"'

# Markdown export.
assert_status 200 /api/docs/v1
assert_json_contains /api/docs/v1 'A tour of'

# Poster + GIF.
assert_status 200 /api/walkthroughs/v1/poster
assert_status 200 /api/walkthroughs/v1/preview.gif

# Changelog RSS.
assert_status 200 /api/walkthroughs/v1/changelog.rss
assert_json_contains /api/walkthroughs/v1/changelog.rss "<rss"

# oEmbed.
assert_status 200 "/api/oembed?url=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("http://localhost:3000/docs/v1"))')"
assert_json_contains "/api/oembed?url=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("http://localhost:3000/docs/v1"))')" '"type":"video"'

# MCP manifest.
assert_status 200 /api/mcp
assert_json_contains /api/mcp '"resources"'
assert_json_contains /api/mcp '"tools"'

# Feedback round-trip.
assert_post_ok /api/walkthroughs/v1/feedback '{"rating":"up","note":"smoke"}'
assert_json_contains /api/walkthroughs/v1/feedback '"total"'

# Reject invalid feedback rating.
got=$(curl -s -X POST "${BASE}/api/walkthroughs/v1/feedback" \
  -H "Content-Type: application/json" \
  -d '{"rating":"sideways"}' \
  --max-time 5 2>/dev/null || true)
if [[ "$got" == *'"invalid_rating"'* ]]; then
  pass "feedback rejects bogus rating"
else
  fail "feedback should reject \`sideways\` (got: $(printf '%s' "$got" | head -c 120))"
fi

# Validation: invalid walkthrough id is 400.
assert_status 400 /api/walkthroughs/..%2Fetc%2Fpasswd/captions

summary

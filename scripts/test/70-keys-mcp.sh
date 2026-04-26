#!/usr/bin/env bash
# Layer 70 — keys API + dev-url preflight + foley-mcp stdio server.
# Cheap probes, no real key validation against external providers.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=./_lib.sh
source "$SCRIPT_DIR/_lib.sh"

echo "── 70 keys + mcp ──────────────────────────────────────────────"

# ── /api/keys GET shape ───────────────────────────────────────────────
KEYS_BODY=$(curl -s "${BASE}/api/keys" --max-time 5 2>/dev/null || true)
for k in ANTHROPIC_API_KEY ELEVENLABS_API_KEY GOOGLE_API_KEY GITHUB_TOKEN; do
  if [[ "$KEYS_BODY" == *"\"$k\""* ]]; then
    pass "/api/keys exposes $k"
  else
    fail "/api/keys missing $k (body: $(printf '%s' "$KEYS_BODY" | head -c 200))"
  fi
done

# ── /api/keys/test rejects invalid keys (no real provider hits) ─────
TEST_BODY=$(curl -s -X POST "${BASE}/api/keys/test" \
  -H "Content-Type: application/json" \
  -d '{"ANTHROPIC_API_KEY":"not-a-real-key"}' --max-time 15 2>/dev/null || true)
if [[ "$TEST_BODY" == *'"ok":false'* ]]; then
  pass "/api/keys/test rejects bogus Anthropic key"
else
  fail "/api/keys/test should have returned ok:false (body: $(printf '%s' "$TEST_BODY" | head -c 200))"
fi

# ── dev-url preflight: self + bad URL ────────────────────────────────
DEV_OK=$(curl -s "${BASE}/api/preflight/dev-url?url=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$BASE"'"))')" --max-time 10 2>/dev/null || true)
if [[ "$DEV_OK" == *'"ok":true'* ]]; then
  pass "/api/preflight/dev-url ok against self"
else
  fail "/api/preflight/dev-url failed against self (body: $(printf '%s' "$DEV_OK" | head -c 200))"
fi
DEV_BAD=$(curl -s "${BASE}/api/preflight/dev-url?url=http%3A%2F%2Flocalhost%3A1" --max-time 10 2>/dev/null || true)
if [[ "$DEV_BAD" == *'"ok":false'* ]]; then
  pass "/api/preflight/dev-url surfaces unreachable URL"
else
  fail "/api/preflight/dev-url should fail on dead port (body: $(printf '%s' "$DEV_BAD" | head -c 200))"
fi

# ── /api/walkthroughs DELETE rejects invalid id ──────────────────────
DEL_BAD=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "${BASE}/api/walkthroughs/..%2Fetc" --max-time 5 2>/dev/null || true)
if [[ "$DEL_BAD" == "400" || "$DEL_BAD" == "404" ]]; then
  pass "DELETE /api/walkthroughs/<bad-id> → $DEL_BAD"
else
  fail "DELETE on bad id returned $DEL_BAD (expected 400/404)"
fi

# ── foley-mcp stdio handshake ────────────────────────────────────────
MCP_BIN="$ROOT/apps/foley-mcp/dist/index.js"
if [[ ! -f "$MCP_BIN" ]]; then
  fail "apps/foley-mcp/dist/index.js missing — run \`pnpm --filter foley-mcp build\`"
else
  MCP_OUT=$( ( \
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' ; \
    sleep 0.2 ; \
    echo '{"jsonrpc":"2.0","method":"notifications/initialized"}' ; \
    sleep 0.2 ; \
    echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' ; \
    sleep 0.4 ) \
    | FOLEY_BASE_URL="$BASE" node "$MCP_BIN" 2>/dev/null )
  if [[ "$MCP_OUT" == *'"name":"foley"'* && "$MCP_OUT" == *'"name":"list_walkthroughs"'* && "$MCP_OUT" == *'"name":"ask_walkthrough"'* && "$MCP_OUT" == *'"name":"get_transcript"'* ]]; then
    pass "foley-mcp announces 3 tools over stdio"
  else
    fail "foley-mcp stdio handshake missing tools (out: $(printf '%s' "$MCP_OUT" | head -c 250))"
  fi
fi

# ── Claude Code skill is on disk ─────────────────────────────────────
if [[ -f "$ROOT/skills/foley/SKILL.md" ]]; then
  if grep -q "^name: foley" "$ROOT/skills/foley/SKILL.md"; then
    pass "skills/foley/SKILL.md has frontmatter name: foley"
  else
    fail "skills/foley/SKILL.md missing frontmatter name"
  fi
else
  fail "skills/foley/SKILL.md missing on disk"
fi

summary
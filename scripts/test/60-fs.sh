#!/usr/bin/env bash
# Filesystem & gitignore sanity. Confirms generated artefacts that should
# be ignored aren't tracked, and that the gitignore covers the new
# overnight additions.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_lib.sh"

echo "── 60 fs ────────────────────────────────────────────────────────"

cd "$ROOT"

# 1. .env is gitignored.
if git check-ignore .env >/dev/null 2>&1; then
  pass ".env is gitignored"
else
  fail ".env should be in .gitignore"
fi

# 2. .render-status.json files are gitignored.
if git check-ignore "walkthroughs/v1/.render-status.json" >/dev/null 2>&1; then
  pass ".render-status.json is gitignored"
else
  fail ".render-status.json should be gitignored"
fi

# 3. .feedback.jsonl files are gitignored.
if git check-ignore "walkthroughs/v1/.feedback.jsonl" >/dev/null 2>&1; then
  pass ".feedback.jsonl is gitignored"
else
  fail ".feedback.jsonl should be gitignored"
fi

# 4. .render.log is gitignored.
if git check-ignore "walkthroughs/v1/.render.log" >/dev/null 2>&1; then
  pass ".render.log is gitignored"
else
  fail ".render.log should be gitignored"
fi

# 5. No .env file is currently tracked.
if git ls-files .env .env.local | grep -q .; then
  fail "an .env file is currently tracked — secrets risk"
else
  pass "no .env file tracked"
fi

# 6. The seeded walkthroughs have intact takes.
for wid in v1 foley; do
  if [[ -f "walkthroughs/$wid/takes/master/master.mp4" ]]; then
    pass "walkthroughs/$wid has a master.mp4"
  else
    fail "walkthroughs/$wid is missing master.mp4"
  fi
done

summary

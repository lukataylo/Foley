#!/usr/bin/env bash
# Foley bootstrap — single-command setup for judges.
#
# Run from the repo root:
#   bash scripts/bootstrap.sh
# or, if executable:
#   ./scripts/bootstrap.sh
#
# Pass --help to print this header and exit.

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Foley bootstrap script.

Usage:
  bash scripts/bootstrap.sh

What it does:
  1. Checks pnpm, uv, and ffmpeg are on PATH.
  2. Runs `pnpm install` at the repo root.
  3. Runs `uv --directory services/director sync`.
  4. Installs the Playwright Chromium browser for the director.
  5. If .env is missing, copies .env.example to .env.

Once it's done, run `pnpm dev` to start the studio.
EOF
  exit 0
fi

# Resolve repo root (parent of this script's directory).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

step() {
  printf '\n\033[1;36m==> %s\033[0m\n' "$1"
}

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf '\n\033[1;31mMissing dependency:\033[0m %s is not on your PATH.\n' "$cmd"
    printf '  %s\n' "$hint"
    exit 1
  fi
  printf '  found %s (%s)\n' "$cmd" "$(command -v "$cmd")"
}

step "Checking prerequisites (pnpm, uv, ffmpeg)"
require_cmd pnpm   "Install with: npm install -g pnpm   (see https://pnpm.io)"
require_cmd uv     "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh   (see https://docs.astral.sh/uv/)"
require_cmd ffmpeg "Install with: brew install ffmpeg"

step "Installing Node dependencies (pnpm install)"
pnpm install

step "Syncing Python dependencies (uv --directory services/director sync)"
uv --directory services/director sync

step "Installing Playwright Chromium (uv --directory services/director run playwright install chromium)"
uv --directory services/director run playwright install chromium

step "Setting up .env"
if [[ -f .env ]]; then
  echo "  .env already exists — leaving it alone."
else
  cp .env.example .env
  echo "  copied .env.example -> .env"
  echo
  echo "  Open .env and fill in:"
  echo "    - ANTHROPIC_API_KEY   (https://console.anthropic.com)"
  echo "    - ELEVENLABS_API_KEY  (https://elevenlabs.io)"
  echo "  (Free tiers are fine for the demo flow.)"
fi

printf '\n\033[1;32mready — start with `pnpm dev`\033[0m\n'

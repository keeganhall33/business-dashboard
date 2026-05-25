#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env.deploy ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy
  set +a
fi

fly deploy --remote-only "$@"

if [ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
  echo "Triggering Vercel deploy hook…"
  curl -fsSL -X POST "$VERCEL_DEPLOY_HOOK_URL" >/dev/null
  echo "Vercel deploy hook triggered."
else
  echo "VERCEL_DEPLOY_HOOK_URL not set; skipping Vercel deploy hook trigger."
fi

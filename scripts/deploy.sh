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

if [ -z "${VERCEL_DEPLOY_HOOK_URL:-}" ]; then
  echo "VERCEL_DEPLOY_HOOK_URL not set; skipping Vercel redeploy trigger"
else
  echo "Triggering Vercel deploy hook…"
  curl -fsS -X POST "$VERCEL_DEPLOY_HOOK_URL" >/dev/null
  echo "Vercel deploy hook triggered"
fi

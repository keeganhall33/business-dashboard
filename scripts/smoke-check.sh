#!/usr/bin/env bash
set -euo pipefail

# Simple post-deploy smoke check for Fly/Vercel.
#
# Usage:
#   SMOKE_BASE_URL="https://<your-domain>" ./scripts/smoke-check.sh
#   SMOKE_BASE_URL="http://localhost:3100" ./scripts/smoke-check.sh
#
# Optional alerts:
#   SLACK_WEBHOOK_URL="https://hooks.slack.com/..." ./scripts/smoke-check.sh

BASE_URL="${SMOKE_BASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "SMOKE_BASE_URL is required (e.g. https://dashboard.example.com)" >&2
  exit 2
fi

fail() {
  local msg="$1"
  echo "[smoke-check] FAIL: $msg" >&2
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -fsS -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"[dashboard smoke-check] ❌ $msg\"}" \
      "$SLACK_WEBHOOK_URL" >/dev/null || true
  fi
  exit 1
}

ok_note() {
  local msg="$1"
  echo "[smoke-check] OK: $msg"
}

# 1) Dashboard HTML should render.
status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/dashboard")
[ "$status" = "200" ] || fail "GET /dashboard returned $status"
ok_note "GET /dashboard"

# 2) Overview API should respond ok.
overview_json=$(curl -fsS "$BASE_URL/api/dashboard/overview") || fail "GET /api/dashboard/overview failed"

echo "$overview_json" | grep -q '"ok"\s*:\s*true' || fail "overview payload did not include ok:true"
ok_note "GET /api/dashboard/overview ok:true"

# 3) Optional: verify collectors payload exists (shape smoke).
echo "$overview_json" | grep -q '"pipelinePanel"' || fail "overview payload missing pipelinePanel"
ok_note "overview payload includes pipelinePanel"

if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -fsS -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"[dashboard smoke-check] ✅ OK: $BASE_URL\"}" \
    "$SLACK_WEBHOOK_URL" >/dev/null || true
fi

echo "[smoke-check] DONE"

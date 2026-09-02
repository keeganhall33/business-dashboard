#!/usr/bin/env bash
set -euo pipefail

# Simple smoke check for the configured Vercel production dashboard or a local server.
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

CURL_RETRIES="${SMOKE_CURL_RETRIES:-4}"
CURL_RETRY_DELAY_SECONDS="${SMOKE_CURL_RETRY_DELAY_SECONDS:-2}"
CURL_CONNECT_TIMEOUT_SECONDS="${SMOKE_CURL_CONNECT_TIMEOUT_SECONDS:-10}"
CURL_MAX_TIME_SECONDS="${SMOKE_CURL_MAX_TIME_SECONDS:-30}"

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

curl_smoke() {
  curl -sS \
    --retry "$CURL_RETRIES" \
    --retry-delay "$CURL_RETRY_DELAY_SECONDS" \
    --retry-all-errors \
    --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" \
    --max-time "$CURL_MAX_TIME_SECONDS" \
    "$@"
}

# 1) The server-rendered dashboard must load successfully. In production this
# exercises the protected overview API through the app's server-side
# x-dashboard-secret path without exposing DASHBOARD_ADMIN_TOKEN to CI.
dashboard_status=$(curl_smoke -o /dev/null -w "%{http_code}" "$BASE_URL/dashboard")
[ "$dashboard_status" = "200" ] || fail "GET /dashboard returned $dashboard_status"
ok_note "GET /dashboard"

# 2) Probe the overview API anonymously.
# - Local/dev may intentionally allow it and return 200, in which case verify shape.
# - Production intentionally requires DASHBOARD_ADMIN_TOKEN and should return 401.
# A 401 here is therefore a security assertion, not a deployment failure, because
# step 1 already proved the SSR dashboard could reach the protected API correctly.
overview_body=$(mktemp)
trap 'rm -f "$overview_body"' EXIT
overview_status=$(curl_smoke -o "$overview_body" -w "%{http_code}" "$BASE_URL/api/dashboard/overview")

case "$overview_status" in
  200)
    grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$overview_body" || fail "overview payload did not include ok:true"
    ok_note "GET /api/dashboard/overview ok:true"

    grep -q '"pipelinePanel"' "$overview_body" || fail "overview payload missing pipelinePanel"
    ok_note "overview payload includes pipelinePanel"
    ;;
  401)
    ok_note "GET /api/dashboard/overview correctly requires dashboard authentication (401)"
    ;;
  *)
    fail "GET /api/dashboard/overview returned unexpected status $overview_status"
    ;;
esac

if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -fsS -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"[dashboard smoke-check] ✅ OK: $BASE_URL\"}" \
    "$SLACK_WEBHOOK_URL" >/dev/null || true
fi

echo "[smoke-check] DONE"

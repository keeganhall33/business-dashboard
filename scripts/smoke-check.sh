#!/usr/bin/env bash
set -euo pipefail

# Simple smoke check for the configured Vercel production dashboard or a local server.
#
# Usage:
#   SMOKE_BASE_URL="https://<your-domain>" ./scripts/smoke-check.sh
#   SMOKE_BASE_URL="http://localhost:3100" ./scripts/smoke-check.sh
#
# Optional release proof:
#   EXPECTED_RELEASE_SHA="<git-sha>" ./scripts/smoke-check.sh
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

route_headers=$(mktemp)
health_body=$(mktemp)
overview_body=$(mktemp)
trap 'rm -f "$route_headers" "$health_body" "$overview_body"' EXIT

# 1) Prove the deployed runtime is healthy and, when a release SHA is supplied,
# that the configured production URL is serving the exact expected Vercel commit.
health_status=$(curl_smoke -o "$health_body" -w "%{http_code}" "$BASE_URL/api/health")
[ "$health_status" = "200" ] || fail "GET /api/health returned $health_status"
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "$health_body" || fail "health payload did not include ok:true"
ok_note "GET /api/health ok:true"

if [ -n "${EXPECTED_RELEASE_SHA:-}" ]; then
  grep -Eq '"releaseSha"[[:space:]]*:[[:space:]]*"'"$EXPECTED_RELEASE_SHA"'"' "$health_body" \
    || fail "production health did not report expected release $EXPECTED_RELEASE_SHA"
  ok_note "production release matches $EXPECTED_RELEASE_SHA"
fi

# 2) Every canonical Useful V1 workspace and core CRM directory must either render
# directly (local/dev auth bypass) or enforce the production private-login boundary.
# This is a route/runtime proof only; it does not claim authenticated business-data
# correctness, which remains covered by source-specific/live acceptance gates.
protected_routes=(
  "/dashboard"
  "/strategy"
  "/opportunities-actions"
  "/relationships"
  "/relationships/people"
  "/relationships/companies"
  "/relationships/activity"
  "/events-market-windows"
  "/specialists"
  "/learning"
  "/data-evidence"
  "/ask-jeeves"
)

saw_login_redirect=false
for route in "${protected_routes[@]}"; do
  : > "$route_headers"
  route_status=$(curl_smoke -D "$route_headers" -o /dev/null -w "%{http_code}" "$BASE_URL$route")

  case "$route_status" in
    200)
      ok_note "GET $route rendered directly"
      ;;
    302|307)
      route_location=$(awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/\r$/, ""); sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' "$route_headers")
      case "$route_location" in
        *"/login"*) ;;
        *) fail "GET $route redirected to unexpected location: ${route_location:-missing}" ;;
      esac
      saw_login_redirect=true
      ok_note "GET $route correctly requires private sign-in ($route_status -> /login)"
      ;;
    *)
      fail "GET $route returned $route_status"
      ;;
  esac
done

if [ "$saw_login_redirect" = true ]; then
  login_status=$(curl_smoke -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  [ "$login_status" = "200" ] || fail "GET /login returned $login_status after protected route redirect"
  ok_note "GET /login"
fi

# 3) Probe the overview API anonymously.
# - Local/dev may intentionally allow it and return 200, in which case verify shape.
# - Production intentionally requires DASHBOARD_ADMIN_TOKEN and should return 401.
# A 401 here is therefore a security assertion, not a deployment failure.
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

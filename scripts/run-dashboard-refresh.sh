#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[dashboard-refresh] $1"
}

RUN_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$RUN_DIR"

STATUS_FILE="dashboard/logs/dashboard-refresh.log"
mkdir -p "$(dirname "$STATUS_FILE")"
RUN_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "RUN $RUN_AT" > "$STATUS_FILE"

run_step() {
  local name="$1"
  shift
  log "Starting $name"
  if "$@" >> "$STATUS_FILE" 2>&1; then
    log "$name succeeded"
    echo "$name=ok" >> "$STATUS_FILE"
  else
    local exitCode=$?
    log "$name FAILED (exit $exitCode). See $STATUS_FILE"
    echo "$name=fail" >> "$STATUS_FILE"
    return $exitCode
  fi
}

NON_FATAL_OK=true

if ! run_step website op run --env-file=.env --env-file=.env.website -- node scripts/run-website-conversion.mjs; then
  NON_FATAL_OK=false
fi

if ! run_step products op run --env-file=.env --env-file=.env.website -- pnpm products:run; then
  NON_FATAL_OK=false
fi

if ! run_step marketing op run --env-file=.env --env-file=.env.website -- pnpm marketing:run; then
  NON_FATAL_OK=false
fi

if ! run_step meta op run --env-file=.env --env-file=.env.meta -- pnpm meta:run; then
  NON_FATAL_OK=false
fi

if ! run_step social op run --env-file=.env --env-file=.env.meta -- pnpm social:run; then
  NON_FATAL_OK=false
fi

if [ "$NON_FATAL_OK" = false ]; then
  log "Refresh completed with non-fatal errors. Review $STATUS_FILE"
else
  log "Refresh completed successfully"
fi

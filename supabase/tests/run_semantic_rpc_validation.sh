#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C
export LANG=C

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}" )/../.." && pwd)
MIGRATION_PATH=${SEMANTIC_RPC_MIGRATION_PATH:-"$REPO_ROOT/supabase/migrations/20260713_add_woo_semantic_rpc.sql"}
SETUP_SQL="$REPO_ROOT/supabase/tests/semantic_rpc_setup.sql"
VALIDATION_SQL="$REPO_ROOT/supabase/validation/20260713_woo_post_install_shadow.sql"
PGPORT=${PGPORT:-55434}
PGDATA_DIR=$(mktemp -d -t semantic-validation-pgdata-XXXXXX)
LOGFILE="$PGDATA_DIR/postgres.log"

cleanup() {
  local exit_code=$?
  if [[ -n "${PGDATA_DIR:-}" && -d "$PGDATA_DIR" ]]; then
    if [[ -f "$PGDATA_DIR/postmaster.pid" ]]; then
      pg_ctl -D "$PGDATA_DIR" -o "-p $PGPORT" stop >/dev/null 2>&1 || true
    fi
    rm -rf "$PGDATA_DIR"
    echo "Temporary data directory removed: $PGDATA_DIR"
  fi
  echo "Cleanup complete (exit_code=$exit_code)"
  exit $exit_code
}
trap cleanup EXIT INT TERM

if [[ ! -f "$MIGRATION_PATH" ]]; then
  echo "ERROR: migration file not found at $MIGRATION_PATH" >&2
  exit 1
fi
if [[ ! -f "$SETUP_SQL" ]]; then
  echo "ERROR: setup SQL not found at $SETUP_SQL" >&2
  exit 1
fi
if [[ ! -f "$VALIDATION_SQL" ]]; then
  echo "ERROR: validation SQL not found at $VALIDATION_SQL" >&2
  exit 1
fi

START_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$START_TS] Initializing validation cluster (PGDATA=$PGDATA_DIR, PGPORT=$PGPORT)"
initdb -D "$PGDATA_DIR" >/dev/null
pg_ctl -D "$PGDATA_DIR" -o "-p $PGPORT" -l "$LOGFILE" start >/dev/null

for attempt in {1..20}; do
  if pg_isready -p "$PGPORT" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "PostgreSQL version: $(psql -p "$PGPORT" -d postgres -Atqc "select version()")"
echo "Cluster log: $LOGFILE"

echo "[setup] Installing schema, data, legacy RPCs, and semantic migration"
psql -v ON_ERROR_STOP=1 -p "$PGPORT" postgres \
  -v semantic_migration_file="$MIGRATION_PATH" \
  -f "$SETUP_SQL"

echo "[validation] Running post-install shadow comparison"
psql -v ON_ERROR_STOP=1 -p "$PGPORT" postgres \
  -f "$VALIDATION_SQL"

END_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$END_TS] Semantic RPC validation completed successfully"

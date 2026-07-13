#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C
export LANG=C

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PGDATA_DIR=$(mktemp -d)
PGPORT=${PGPORT:-55432}
LOGFILE="$PGDATA_DIR/postgres.log"

initdb -D "$PGDATA_DIR" > /dev/null
pg_ctl -D "$PGDATA_DIR" -o "-p $PGPORT" -l "$LOGFILE" start > /dev/null
trap 'pg_ctl -D "$PGDATA_DIR" stop > /dev/null; rm -rf "$PGDATA_DIR"' EXIT

psql -v ON_ERROR_STOP=1 -p "$PGPORT" postgres -f "$REPO_ROOT/supabase/tests/semantic_rpc_regression.sql" > /dev/null

echo "Semantic RPC regression test passed."

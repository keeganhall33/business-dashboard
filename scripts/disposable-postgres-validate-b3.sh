#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIG_DIR="$ROOT_DIR/supabase/migrations"
A5="$MIG_DIR/20260804_external_intelligence_phase_a5.sql"
A61="$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
B2="$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
B3="$MIG_DIR/20260805_external_intelligence_phase_b3_internal_activation.sql"
B3RB="$MIG_DIR/20260805_external_intelligence_phase_b3_internal_activation.rollback.sql"

TMP="${TMPDIR:-/tmp}/b3pg-$$"
mkdir -p "$TMP"

export LC_ALL=C

echo "initdb"
initdb -D "$TMP/data" >/dev/null

PGPORT=55439
pg_ctl -D "$TMP/data" -o "-p $PGPORT" -w start >/dev/null

cleanup() {
  pg_ctl -D "$TMP/data" -w stop >/dev/null || true
  rm -rf "$TMP" || true
}
trap cleanup EXIT

psql_base=(psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PGPORT" -U "$(whoami)" -d postgres)

apply() {
  local f="$1"
  "${psql_base[@]}" -f "$f" >/dev/null
}

"${psql_base[@]}" -c "create database b3test" >/dev/null
psql_base=(psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PGPORT" -U "$(whoami)" -d b3test)

# minimal supabase roles
"${psql_base[@]}" -c "do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;" >/dev/null
"${psql_base[@]}" -c "do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null
"${psql_base[@]}" -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$;" >/dev/null

apply "$A5"
apply "$A61"
apply "$B2"
apply "$B3"

# Rerun safety
apply "$B3"

echo "lock contention"
OUT1="$(${psql_base[@]} -tA -c "select acquired, lease_token is not null from public.acquire_internal_orchestration_lock_v1('k','o1',2);")"
# acquired|t
echo "$OUT1" | rg -q '^t\|t$'

OUT2="$(${psql_base[@]} -tA -c "select acquired from public.acquire_internal_orchestration_lock_v1('k','o2',2);")"
[ "$OUT2" = "f" ]

TOKEN="$(${psql_base[@]} -tA -c "select lease_token from public.internal_orchestration_locks_v1 where lock_key='k';")"

# wrong token cannot renew
RENEW_BAD="$(${psql_base[@]} -tA -c "select renewed from public.renew_internal_orchestration_lock_v1('k',repeat('0',64),2);")"
[ "$RENEW_BAD" = "f" ]

# correct token renews
RENEW_OK="$(${psql_base[@]} -tA -c "select renewed from public.renew_internal_orchestration_lock_v1('k','$TOKEN',2);")"
[ "$RENEW_OK" = "t" ]

# expiry recovery: force expires_at in past and acquire
"${psql_base[@]}" -c "update public.internal_orchestration_locks_v1 set expires_at=now()-interval '1 second' where lock_key='k';" >/dev/null
OUT3="$(${psql_base[@]} -tA -c "select acquired from public.acquire_internal_orchestration_lock_v1('k','o3',2);")"
[ "$OUT3" = "t" ]

# wrong token release does not clear, but is idempotent true
REL_BAD="$(${psql_base[@]} -tA -c "select public.release_internal_orchestration_lock_v1('k',repeat('0',64));")"
[ "$REL_BAD" = "t" ]

# rollback and reapply
apply "$B3RB"
apply "$B3"

echo OK

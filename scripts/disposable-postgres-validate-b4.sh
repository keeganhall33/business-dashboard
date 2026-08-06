#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIG_DIR="$ROOT_DIR/supabase/migrations"
A5="$MIG_DIR/20260804_external_intelligence_phase_a5.sql"
A61="$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
B2="$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
B3="$MIG_DIR/20260805_external_intelligence_phase_b3_internal_activation.sql"
B4="$MIG_DIR/20260805_external_intelligence_phase_b4_recurring_activation.sql"
B4RB="$MIG_DIR/20260805_external_intelligence_phase_b4_recurring_activation.rollback.sql"

TMP="${TMPDIR:-/tmp}/b4pg-$$"
mkdir -p "$TMP"

export LC_ALL=C

echo "initdb"
initdb -D "$TMP/data" >/dev/null

PGPORT=55441
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

"${psql_base[@]}" -c "create database b4test" >/dev/null
psql_base=(psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PGPORT" -U "$(whoami)" -d b4test)

# minimal supabase roles
"${psql_base[@]}" -c "do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$;" >/dev/null
"${psql_base[@]}" -c "do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;" >/dev/null
"${psql_base[@]}" -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$;" >/dev/null

apply "$A5"
apply "$A61"
apply "$B2"
apply "$B3"
apply "$B4"

# Rerun safety
apply "$B4"

echo "activate: dormant state"
ACT1="a1"
HASH="1111111111111111111111111111111111111111111111111111111111111111"
OUT1="$(${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.activate_external_intelligence_internal_orchestration_v1('${ACT1}','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" | tail -n 1)"
[ "$OUT1" = "activated" ]

# exactly one scheduled row
C1="$(${psql_base[@]} -tA -c "select count(*) from public.scheduled_jobs where job_key='external-intelligence-heartbeat';")"
[ "$C1" = "1" ]

# exactly four enabled internal jobs
C2="$(${psql_base[@]} -tA -c "select count(*) from public.internal_orchestration_jobs_v1 where environment='production' and enabled=true;" )"
[ "$C2" = "4" ]

# next_run_at preserved across idempotent replay
NEXT1="$(${psql_base[@]} -tA -c "select next_run_at from public.scheduled_jobs where job_key='external-intelligence-heartbeat';")"

echo "activate: identical active configuration => idempotent replay"
ACT2="a2"
OUT2="$(${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.activate_external_intelligence_internal_orchestration_v1('${ACT2}','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" | tail -n 1)"
[ "$OUT2" = "idempotent_replay" ]
NEXT2="$(${psql_base[@]} -tA -c "select next_run_at from public.scheduled_jobs where job_key='external-intelligence-heartbeat';")"
[ "$NEXT1" = "$NEXT2" ]

echo "activate: conflicting configuration fails closed"
set +e
${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.activate_external_intelligence_internal_orchestration_v1('a3','v1','2222222222222222222222222222222222222222222222222222222222222222','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" >/dev/null 2>&1
CONFLICT_CODE=$?
set -e
[ $CONFLICT_CODE -ne 0 ]

echo "activate: duplicate activation_id rejected"
set +e
${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.activate_external_intelligence_internal_orchestration_v1('${ACT1}','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" >/dev/null 2>&1
DUP_CODE=$?
set -e
[ $DUP_CODE -ne 0 ]

echo "activate: partial state repaired (one job disabled)"
${psql_base[@]} -c "update public.internal_orchestration_jobs_v1 set enabled=false where job_name='milestone-horizon-scan-v1';" >/dev/null
OUTP="$(${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.activate_external_intelligence_internal_orchestration_v1('a4','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" | tail -n 1)"
[ "$OUTP" = "idempotent_replay" ]
C3="$(${psql_base[@]} -tA -c "select count(*) from public.internal_orchestration_jobs_v1 where environment='production' and enabled=true;" )"
[ "$C3" = "4" ]

echo "disable: atomic"
DIS1="d1"
OUTD1="$(${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.disable_external_intelligence_internal_orchestration_v1('${DIS1}','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" | tail -n 1)"
[ "$OUTD1" = "disabled" ]

C4="$(${psql_base[@]} -tA -c "select count(*) from public.scheduled_jobs where job_key='external-intelligence-heartbeat' and is_active=true;" )"
[ "$C4" = "0" ]
C5="$(${psql_base[@]} -tA -c "select count(*) from public.internal_orchestration_jobs_v1 where environment='production' and enabled=true;" )"
[ "$C5" = "0" ]

echo "disable: idempotent replay when already disabled"
OUTD2="$(${psql_base[@]} -tA -c "set session authorization service_role; select result_code from public.disable_external_intelligence_internal_orchestration_v1('d2','v1','${HASH}','production','tester',now(),'owner','policy','ibjsjosplgbqevmnvvpf');" | tail -n 1)"
[ "$OUTD2" = "idempotent_replay" ]

echo "rollback + reapply"
apply "$B4RB"
apply "$B4"

echo OK

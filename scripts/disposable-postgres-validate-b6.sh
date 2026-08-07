#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL validation for Phase B6 Hoophall source governance + RPC behavior.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export LC_ALL=C
export LANG=C

if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
  echo "initdb + pg_ctl are required" >&2
  exit 1
fi

PGROOT="${TMPDIR:-/tmp}/b6-disposable-pg"
PGPORT="55434"
PGSOCK="${PGROOT}/sock"

cleanup() {
  pg_ctl -D "${PGROOT}/data" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf "$PGROOT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "$PGROOT" >/dev/null 2>&1 || true
mkdir -p "${PGROOT}/data" "$PGSOCK"

initdb -D "${PGROOT}/data" -U postgres -A trust >/dev/null
pg_ctl -D "${PGROOT}/data" -o "-p ${PGPORT} -k ${PGSOCK}" -w start >/dev/null

psql_base=(psql "postgresql://postgres@127.0.0.1:${PGPORT}/postgres?host=${PGSOCK}" -v ON_ERROR_STOP=1)
"${psql_base[@]}" -c 'create database b6test;' >/dev/null
psql_db=(psql "postgresql://postgres@127.0.0.1:${PGPORT}/b6test?host=${PGSOCK}" -v ON_ERROR_STOP=1)

"${psql_db[@]}" -c 'do $$ begin create role anon; exception when duplicate_object then end; $$;' >/dev/null
"${psql_db[@]}" -c 'do $$ begin create role authenticated; exception when duplicate_object then end; $$;' >/dev/null
"${psql_db[@]}" -c 'do $$ begin create role service_role; exception when duplicate_object then end; $$;' >/dev/null

apply() {
  local f="$1"
  echo "apply $(basename "$f")"
  "${psql_db[@]}" -f "$f" >/dev/null
}

MIG_DIR="supabase/migrations"
apply "$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b3_internal_activation.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b4_recurring_activation.sql"
apply "$MIG_DIR/20260807050000_external_intelligence_phase_b5_lifecycle_probe.sql"
apply "$MIG_DIR/20260807195000_external_intelligence_phase_b6_hoophall_source.sql"

echo "B6: schedule seeded disabled"
ENABLED="$(${psql_db[@]} -tA -c "select enabled from public.external_collection_schedules_v1 where schedule_id='sports.basketball.hoophall.official:production';")"
[ "$ENABLED" = "f" ]

echo "B6: RPC grants are service_role only"
GRANTS="$(${psql_db[@]} -tA -c "select string_agg(grantee, ',') from information_schema.role_routine_grants where routine_name='enable_hoophall_collection_v1';")"
echo "$GRANTS" | grep -q "service_role"

echo "B6: enable refuses when another real external schedule enabled"
"${psql_db[@]}" -c "insert into public.external_collection_schedules_v1(schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,timezone,preferred_window_json,freshness_sla_seconds,maximum_staleness_seconds,timeout_seconds,maximum_attempts,backoff_policy_json,rate_limit_budget_json,concurrency_key,priority,enabled,collection_mode,environment,review_by)
values ('sch_other','economics.fred','v1',repeat('0',64),repeat('0',64),repeat('0',64),'v1','daily',86400,'UTC','{}',86400,86400,20,1,'{}','{}','ck','low',true,'automated','production','ops')
on conflict do nothing;" >/dev/null

set +e
OUT="$(${psql_db[@]} -tA -c "select * from public.enable_hoophall_collection_v1('tester','production');" 2>&1)"
set -e
echo "$OUT" | grep -q "precondition_failed"

"${psql_db[@]}" -c "update public.external_collection_schedules_v1 set enabled=false where schedule_id='sch_other';" >/dev/null

echo "B6: enable works when no other real sources enabled"
"${psql_db[@]}" -c "select * from public.enable_hoophall_collection_v1('tester','production');" >/dev/null
ENABLED2="$(${psql_db[@]} -tA -c "select enabled from public.external_collection_schedules_v1 where schedule_id='sports.basketball.hoophall.official:production';")"
[ "$ENABLED2" = "t" ]

echo "B6: disable cancels only Hoophall jobs"
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key,lease_owner,lease_expires_at)
values ('job_h','sports.basketball.hoophall.official:production','sports.basketball.hoophall.official','plan',now(),now(),'leased',3,repeat('a',64),'job_h','sports:hoophall','w',now()+interval '1 hour')
on conflict do nothing;" >/dev/null
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('job_other','sch_other','economics.fred','plan',now(),now(),'queued',1,repeat('b',64),'job_other','ck')
on conflict do nothing;" >/dev/null

"${psql_db[@]}" -c "select * from public.disable_hoophall_collection_v1('tester','production');" >/dev/null

STATUS_H="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='job_h';")"
[ "$STATUS_H" = "cancelled" ]

LEASE_H="$(${psql_db[@]} -tA -c "select coalesce(lease_owner,'') from public.external_collection_jobs_v1 where job_id='job_h';")"
[ -z "$LEASE_H" ]

STATUS_O="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='job_other';")"
[ "$STATUS_O" = "queued" ]

echo "B6 disposable postgres validation: OK"


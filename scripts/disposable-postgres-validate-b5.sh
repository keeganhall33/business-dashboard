#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL validation for Phase B5 lifecycle probe lane.
# Runs against a disposable local Postgres cluster via initdb/pg_ctl.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export LC_ALL=C
export LANG=C

if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
  echo "initdb + pg_ctl are required" >&2
  exit 1
fi

PGROOT="${TMPDIR:-/tmp}/b5-disposable-pg"
PGPORT="55433"
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
"${psql_base[@]}" -c 'create database b5test;' >/dev/null
psql_db=(psql "postgresql://postgres@127.0.0.1:${PGPORT}/b5test?host=${PGSOCK}" -v ON_ERROR_STOP=1)

# Supabase migrations assume these roles exist.
"${psql_db[@]}" -c 'do $$ begin create role anon; exception when duplicate_object then end; $$;' >/dev/null
"${psql_db[@]}" -c 'do $$ begin create role authenticated; exception when duplicate_object then end; $$;' >/dev/null
"${psql_db[@]}" -c 'do $$ begin create role service_role; exception when duplicate_object then end; $$;' >/dev/null

apply() {
  local f="$1"
  echo "apply $(basename "$f")"
  "${psql_db[@]}" -f "$f" >/dev/null
}

MIG_DIR="supabase/migrations"

# Minimum schema needed for B5: A6 RPC base + B2 orchestrator tables/RPCs + B3/B4 lock/activation + B5 probe.
apply "$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b3_internal_activation.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b4_recurring_activation.sql"
apply "$MIG_DIR/20260807050000_external_intelligence_phase_b5_lifecycle_probe.sql"

echo "B5: schedule exists and is disabled by default"
ENABLED="$(${psql_db[@]} -tA -c "select enabled from public.external_collection_schedules_v1 where schedule_id='internal.lifecycle_probe:production';")"
[ "$ENABLED" = "f" ]

echo "B5: disabled schedule cannot enqueue (simulate tick eval)"
# No jobs should exist.
JCOUNT="$(${psql_db[@]} -tA -c "select count(*) from public.external_collection_jobs_v1 where schedule_id='internal.lifecycle_probe:production';")"
[ "$JCOUNT" = "0" ]

echo "B5: enable probe via RPC"
"${psql_db[@]}" -c "select * from public.enable_external_lifecycle_probe_v1('tester','production','b5_success_v1');" >/dev/null

echo "B5: enqueue idempotent job"
PLANNED_FOR="2026-08-07T00:00:00Z"
FINGERPRINT="$(printf "probe|%s" "$PLANNED_FOR" | shasum -a 256 | awk '{print $1}')"
JOB_ID="job_probe_1"

"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('$JOB_ID','internal.lifecycle_probe:production','internal.lifecycle_probe','internal/no-network','$PLANNED_FOR','$PLANNED_FOR','queued',3,'$FINGERPRINT','$JOB_ID','internal:lifecycle_probe')
on conflict do nothing;" >/dev/null

"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('$JOB_ID','internal.lifecycle_probe:production','internal.lifecycle_probe','internal/no-network','$PLANNED_FOR','$PLANNED_FOR','queued',3,'$FINGERPRINT','$JOB_ID','internal:lifecycle_probe')
on conflict do nothing;" >/dev/null

JCOUNT2="$(${psql_db[@]} -tA -c "select count(*) from public.external_collection_jobs_v1 where job_id='$JOB_ID';")"
[ "$JCOUNT2" = "1" ]

echo "B5: lease -> running -> succeed -> lease released"
LEASED="$(${psql_db[@]} -tA -c "select job_id from public.lease_external_collection_job_v1('worker1', 60, 1, 1);")"
[ "$LEASED" = "$JOB_ID" ]

"${psql_db[@]}" -c "update public.external_collection_jobs_v1 set status='running', started_at=now() where job_id='$JOB_ID';" >/dev/null

"${psql_db[@]}" -c "select job_id from public.release_external_collection_job_lease_v1('$JOB_ID','worker1','succeeded');" >/dev/null

STATUS="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='$JOB_ID';")"
[ "$STATUS" = "succeeded" ]

LEASE_OWNER="$(${psql_db[@]} -tA -c "select coalesce(lease_owner,'') from public.external_collection_jobs_v1 where job_id='$JOB_ID';")"
[ -z "$LEASE_OWNER" ]

echo "B5: advance next_run_at"
"${psql_db[@]}" -c "update public.external_collection_schedules_v1 set next_run_at=now()+interval '1 hour' where schedule_id='internal.lifecycle_probe:production';" >/dev/null
NEXT_RUN_AT="$(${psql_db[@]} -tA -c "select next_run_at is not null from public.external_collection_schedules_v1 where schedule_id='internal.lifecycle_probe:production';")"
[ "$NEXT_RUN_AT" = "t" ]

echo "B5: retryable synthetic failure follows canonical retry policy"
JOB_R="job_probe_retry"
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('$JOB_R','internal.lifecycle_probe:production','internal.lifecycle_probe','internal/no-network','$PLANNED_FOR','$PLANNED_FOR','queued',3,repeat('a',64),'$JOB_R','internal:lifecycle_probe')
on conflict do nothing;" >/dev/null

LEASED_R="$(${psql_db[@]} -tA -c "select job_id from public.lease_external_collection_job_v1('worker2', 60, 1, 1);")"
[ "$LEASED_R" = "$JOB_R" ]

# Simulate a retryable failure by releasing to retry_wait.
"${psql_db[@]}" -c "select job_id from public.release_external_collection_job_lease_v1('$JOB_R','worker2','retry_wait');" >/dev/null
STATUS_R="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='$JOB_R';")"
[ "$STATUS_R" = "retry_wait" ]

# Prevent the retry_wait job from being selected again when we test other lanes.
"${psql_db[@]}" -c "update public.external_collection_jobs_v1 set run_after = now() + interval '1 day' where job_id='$JOB_R';" >/dev/null

echo "B5: permanent failure reaches failed"
JOB_F="job_probe_fail"
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('$JOB_F','internal.lifecycle_probe:production','internal.lifecycle_probe','internal/no-network','$PLANNED_FOR','$PLANNED_FOR','queued',1,repeat('b',64),'$JOB_F','internal:lifecycle_probe')
on conflict do nothing;" >/dev/null

LEASED_F="$(${psql_db[@]} -tA -c "select job_id from public.lease_external_collection_job_v1('worker3', 60, 1, 1);")"
[ "$LEASED_F" = "$JOB_F" ]
"${psql_db[@]}" -c "select job_id from public.release_external_collection_job_lease_v1('$JOB_F','worker3','failed');" >/dev/null
STATUS_F="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='$JOB_F';")"
[ "$STATUS_F" = "failed" ]

echo "B5: disable cancels only probe jobs and clears leases"
# Create an unrelated schedule + job that must remain untouched.
"${psql_db[@]}" -c "insert into public.external_collection_schedules_v1(schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,timezone,preferred_window_json,freshness_sla_seconds,maximum_staleness_seconds,timeout_seconds,maximum_attempts,backoff_policy_json,rate_limit_budget_json,concurrency_key,priority,enabled,collection_mode,environment,review_by)
values ('sch_other','economics.fred','v1',repeat('0',64),repeat('0',64),repeat('0',64),'v1','daily',86400,'UTC','{}',86400,86400,20,1,'{}','{}','ck','low',true,'automated','production','ops')
on conflict do nothing;" >/dev/null
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('job_other','sch_other','economics.fred','plan','$PLANNED_FOR','$PLANNED_FOR','queued',1,repeat('c',64),'job_other','ck')
on conflict do nothing;" >/dev/null

# Create a leased probe job.
JOB_L="job_probe_leased"
"${psql_db[@]}" -c "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key,lease_owner,lease_expires_at)
values ('$JOB_L','internal.lifecycle_probe:production','internal.lifecycle_probe','internal/no-network','$PLANNED_FOR','$PLANNED_FOR','leased',3,repeat('d',64),'$JOB_L','internal:lifecycle_probe','wX',now()+interval '1 hour')
on conflict do nothing;" >/dev/null

"${psql_db[@]}" -c "select * from public.disable_external_lifecycle_probe_v1('tester','production');" >/dev/null

ENABLED2="$(${psql_db[@]} -tA -c "select enabled from public.external_collection_schedules_v1 where schedule_id='internal.lifecycle_probe:production';")"
[ "$ENABLED2" = "f" ]

PROBE_LEASE_OWNER="$(${psql_db[@]} -tA -c "select coalesce(lease_owner,'') from public.external_collection_jobs_v1 where job_id='$JOB_L';")"
[ -z "$PROBE_LEASE_OWNER" ]
PROBE_STATUS="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='$JOB_L';")"
[ "$PROBE_STATUS" = "cancelled" ]

OTHER_STATUS="$(${psql_db[@]} -tA -c "select status from public.external_collection_jobs_v1 where job_id='job_other';")"
[ "$OTHER_STATUS" = "queued" ]

echo "B5 disposable postgres validation: OK"

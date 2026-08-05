#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C
export LANG=C

TMP_DIR="$(mktemp -d -t b2pg.XXXXXX)"
DATA_DIR="$TMP_DIR/data"
PORT="${B2_PG_PORT:-$((55000 + (RANDOM % 1000)))}"

cleanup() {
  if [ -d "$DATA_DIR" ]; then
    pg_ctl -D "$DATA_DIR" -w stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "tmp=$TMP_DIR port=$PORT"

initdb -D "$DATA_DIR" -A trust -U postgres >/dev/null
pg_ctl -D "$DATA_DIR" -o "-p $PORT -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off" -w start >/dev/null

psql_base=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1)

"${psql_base[@]}" -c "create database b2test;" >/dev/null

apply() {
  local file="$1"
  echo "apply $file"
  "${psql_base[@]}" -d b2test -f "$file" >/dev/null
}

MIG_DIR="supabase/migrations"
apply "$MIG_DIR/20260804_external_intelligence_phase_a5.sql"

# Supabase migrations assume these roles exist.
"${psql_base[@]}" -d b2test -c 'do $$ begin create role anon; exception when duplicate_object then end; $$;' >/dev/null
"${psql_base[@]}" -d b2test -c 'do $$ begin create role authenticated; exception when duplicate_object then end; $$;' >/dev/null
"${psql_base[@]}" -d b2test -c 'do $$ begin create role service_role; exception when duplicate_object then end; $$;' >/dev/null

apply "$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"  # rerun

# Lease concurrency: second lease should return empty.
echo "lease test"
"${psql_base[@]}" -d b2test -c "\
insert into public.external_collection_schedules_v1(schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,timezone,preferred_window_json,freshness_sla_seconds,maximum_staleness_seconds,timeout_seconds,maximum_attempts,backoff_policy_json,rate_limit_budget_json,concurrency_key,priority,enabled,collection_mode,environment,review_by)
values ('sch','economics.fred','v1.0.0',repeat('a',64),repeat('b',64),repeat('c',64),'v1.0.0','daily',86400,'UTC','{}',86400,86400,20,0,'{}','{}','ck','low',true,'automated','local','ops')
on conflict do nothing;" >/dev/null

"${psql_base[@]}" -d b2test -c "\
insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key)
values ('job1','sch','economics.fred','plan','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z','queued',0,repeat('d',64),'job1','ck')
on conflict do nothing;" >/dev/null

LEASE1="$("${psql_base[@]}" -d b2test -tA -c "select job_id from public.lease_external_collection_job_v1('w1', 60, 10, 1);")"
LEASE2="$("${psql_base[@]}" -d b2test -tA -c "select job_id from public.lease_external_collection_job_v1('w2', 60, 10, 1);")"

[ "$LEASE1" = "job1" ]
[ -z "$LEASE2" ]

# Milestone persistence: insert + replay + conflict.
echo "milestone test"
HASH2="$(printf '2%.0s' {1..64})"
POLICY_JSON="[{\"policy_name\":\"confidence\",\"semantic_version\":\"v1.0.0\",\"content_hash\":\"$HASH2\"}]"

"${psql_base[@]}" -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('1',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-03\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-03',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'none'
);" >/dev/null

"${psql_base[@]}" -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('1',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-03\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-03',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'none'
);" >/dev/null

set +e
"${psql_base[@]}" -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('1',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-04\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-04',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'none'
);" >/dev/null 2>&1
CONFLICT_CODE=$?
set -e
[ $CONFLICT_CODE -ne 0 ]

# Rollback and reapply.
echo "rollback/reapply"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.rollback.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"

echo "OK"

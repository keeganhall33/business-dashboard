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

# Renewal: wrong owner cannot renew; correct owner can.
RENEW_BAD="$("${psql_base[@]}" -d b2test -tA -c "select job_id from public.renew_external_collection_job_lease_v1('job1','w2',60);")"
[ -z "$RENEW_BAD" ]
RENEW_OK="$("${psql_base[@]}" -d b2test -tA -c "select job_id from public.renew_external_collection_job_lease_v1('job1','w1',60);")"
[ "$RENEW_OK" = "job1" ]

# Expiry + recovery: force lease expiry then recover into retry_wait.
"${psql_base[@]}" -d b2test -c "update public.external_collection_jobs_v1 set status='running', lease_expires_at=now()-interval '1 second' where job_id='job1';" >/dev/null
RECOVERED="$("${psql_base[@]}" -d b2test -tA -c "select public.recover_expired_external_collection_leases_v1();")"
[ "$RECOVERED" = "1" ]
STATUS_RECOVERED="$("${psql_base[@]}" -d b2test -tA -c "select status from public.external_collection_jobs_v1 where job_id='job1';")"
[ "$STATUS_RECOVERED" = "retry_wait" ]

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

# Correction: new immutable version + current pointer update.
"${psql_base[@]}" -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('9',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-05\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-05',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'corrected'
);" >/dev/null

VCOUNT="$("${psql_base[@]}" -d b2test -tA -c "select count(*) from public.sports_milestone_versions_v1 where milestone_id='m1';")"
[ "$VCOUNT" = "2" ]
CUR_HASH="$("${psql_base[@]}" -d b2test -tA -c "select current_content_hash from public.sports_milestones_v1 where milestone_id='m1';")"
[ "$CUR_HASH" = "$(printf '9%.0s' {1..64})" ]

# Rollback and reapply.
echo "rollback/reapply"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.rollback.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"

# Alert lifecycle: upsert + replay + preserve dismissed/ack + invalidation + expiry.
echo "alert test"

# Recreate milestone state after rollback/reapply.
${psql_base[@]} -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('1',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-03\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-03',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'none'
);" >/dev/null

# Upsert one pending alert.
ALERT_PAYLOAD="[{
  \"alert_id\":\"a1\",
  \"milestone_id\":\"m1\",
  \"milestone_content_hash\":$(printf '"%s"' "$(printf '1%.0s' {1..64})"),
  \"horizon_days\":30,
  \"policy_version\":\"v1.0.0\",
  \"suppression_policy_version\":\"v1.0.0\",
  \"suppression_identity\":\"sup1\",
  \"alert_hash\":\"h1\",
  \"project_class\":\"major_institutional_partnership\",
  \"planning_stage\":\"draft\",
  \"milestone_date\":\"2027-06-03\",
  \"days_remaining_at_creation\":300,
  \"reason_codes\":[\"lead_time\"],
  \"expires_at\":\"2026-08-06T00:00:00Z\"
}]"

INS1="$(${psql_base[@]} -d b2test -tA -c "select inserted_count from public.upsert_sports_milestone_alerts_v1('$ALERT_PAYLOAD'::jsonb);")"
[ "$INS1" = "1" ]

# Replay identical input: no duplicate.
INS2="$(${psql_base[@]} -d b2test -tA -c "select inserted_count from public.upsert_sports_milestone_alerts_v1('$ALERT_PAYLOAD'::jsonb);")"
[ "$INS2" = "0" ]

COUNT1="$(${psql_base[@]} -d b2test -tA -c "select count(*) from public.sports_milestone_alerts_v1 where suppression_identity='sup1';")"
[ "$COUNT1" = "1" ]

# Dismiss should not be reset.
${psql_base[@]} -d b2test -c "update public.sports_milestone_alerts_v1 set status='dismissed', dismissed_at=now() where suppression_identity='sup1';" >/dev/null
${psql_base[@]} -d b2test -c "select * from public.upsert_sports_milestone_alerts_v1('$ALERT_PAYLOAD'::jsonb);" >/dev/null
STATUS_AFTER="$(${psql_base[@]} -d b2test -tA -c "select status from public.sports_milestone_alerts_v1 where suppression_identity='sup1';")"
[ "$STATUS_AFTER" = "dismissed" ]

# Create a new version for milestone and move current pointer; invalidation should affect only pending alerts.
${psql_base[@]} -d b2test -c "select * from public.persist_sports_milestone_v1(
  'm1', repeat('3',64), 'sports_milestone_v1',
  '{\"schema_version\":\"sports_milestone_v1\",\"milestone_id\":\"m1\",\"milestone_type\":\"championship_anniversary\",\"milestone_date\":\"2027-06-03\"}'::jsonb,
  '$POLICY_JSON'::jsonb,
  '[{\"label\":\"x\",\"url\":\"https://example.invalid\"}]'::jsonb,
  '[\"calendar.sports.milestones\"]'::jsonb,
  'championship_anniversary','nba',null,'nba',null,'2027-06-03',null,
  'major_institutional_partnership','high','high','[]'::jsonb,'none'
);" >/dev/null

# Insert a pending alert referencing the old hash and then invalidate.
${psql_base[@]} -d b2test -c "insert into public.sports_milestone_alerts_v1(alert_id,milestone_id,milestone_content_hash,horizon_days,policy_version,suppression_policy_version,suppression_identity,alert_hash,project_class,planning_stage,milestone_date,days_remaining_at_creation,status,reason_codes,expires_at)
values ('a2','m1',repeat('1',64),30,'v1.0.0','v1.0.0','sup2','h2','major_institutional_partnership','draft','2027-06-03',300,'pending','{}','2026-08-06T00:00:00Z')
on conflict do nothing;" >/dev/null

INV1="$(${psql_base[@]} -d b2test -tA -c "select public.invalidate_obsolete_sports_milestone_alerts_v1();")"
[ "$INV1" = "1" ]
INV2="$(${psql_base[@]} -d b2test -tA -c "select public.invalidate_obsolete_sports_milestone_alerts_v1();")"
[ "$INV2" = "0" ]

# Expiry: only pending alerts should expire.
${psql_base[@]} -d b2test -c "insert into public.sports_milestone_alerts_v1(alert_id,milestone_id,milestone_content_hash,horizon_days,policy_version,suppression_policy_version,suppression_identity,alert_hash,project_class,planning_stage,milestone_date,days_remaining_at_creation,status,reason_codes,expires_at)
values ('a3','m1',repeat('3',64),30,'v1.0.0','v1.0.0','sup3','h3','major_institutional_partnership','draft','2027-06-03',300,'pending','{}','2026-08-05T00:00:00Z')
on conflict do nothing;" >/dev/null

EXP1="$(${psql_base[@]} -d b2test -tA -c "select public.expire_sports_milestone_alerts_v1('2026-08-05T12:00:00Z'::timestamptz);")"
[ "$EXP1" = "1" ]
EXP2="$(${psql_base[@]} -d b2test -tA -c "select public.expire_sports_milestone_alerts_v1('2026-08-05T12:00:00Z'::timestamptz);")"
[ "$EXP2" = "0" ]

# Horizon scan: generate alerts from fixture + policy, upsert, rerun idempotently.
echo "horizon scan test"
SCAN_PAYLOAD="$(node --import tsx scripts/milestone-horizon-alerts-json.mjs)"

# Ensure referenced milestones exist and are current for the scan payload.
${psql_base[@]} -d b2test -c "do \$do\$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements('$SCAN_PAYLOAD'::jsonb) loop
    insert into public.sports_milestones_v1(
      milestone_id,
      current_content_hash,
      milestone_type,
      primary_subject_id,
      team_id,
      league_id,
      milestone_date,
      anniversary_number,
      lifecycle_status,
      review_status
    ) values (
      r->>'milestone_id',
      r->>'milestone_content_hash',
      'historic_game_anniversary',
      'seed',
      null,
      'nba',
      (r->>'milestone_date')::date,
      null,
      'active',
      'unreviewed'
    ) on conflict (milestone_id) do update set current_content_hash = excluded.current_content_hash;
  end loop;
end \$do\$;" >/dev/null

HINS1="$(${psql_base[@]} -d b2test -tA -c "select inserted_count from public.upsert_sports_milestone_alerts_v1('$SCAN_PAYLOAD'::jsonb);")"
[ "$HINS1" = "3" ]
HINS2="$(${psql_base[@]} -d b2test -tA -c "select inserted_count from public.upsert_sports_milestone_alerts_v1('$SCAN_PAYLOAD'::jsonb);")"
[ "$HINS2" = "0" ]

# Watchdog health persistence: idempotent upsert on source_id.
echo "watchdog health test"
${psql_base[@]} -d b2test -c "insert into public.external_collection_health_v1(source_id,source_config_version,health_state,credential_state,access_state,terms_state,rate_limit_state,freshness_age_seconds,is_overdue,is_stale,blocker_codes,warning_codes,evaluated_at)
values ('economics.fred','v1.0.0','blocked','unknown','unknown','unknown','{}',null,false,false,'{source_disabled}','{}','2026-08-05T00:00:00Z')
on conflict (source_id) do update set health_state=excluded.health_state, blocker_codes=excluded.blocker_codes, evaluated_at=excluded.evaluated_at;" >/dev/null

${psql_base[@]} -d b2test -c "insert into public.external_collection_health_v1(source_id,source_config_version,health_state,credential_state,access_state,terms_state,rate_limit_state,freshness_age_seconds,is_overdue,is_stale,blocker_codes,warning_codes,evaluated_at)
values ('economics.fred','v1.0.0','blocked','unknown','unknown','unknown','{}',null,false,false,'{source_disabled}','{}','2026-08-05T00:00:00Z')
on conflict (source_id) do update set health_state=excluded.health_state, blocker_codes=excluded.blocker_codes, evaluated_at=excluded.evaluated_at;" >/dev/null

HCOUNT="$(${psql_base[@]} -d b2test -tA -c "select count(*) from public.external_collection_health_v1 where source_id='economics.fred';")"
[ "$HCOUNT" = "1" ]

echo "OK"

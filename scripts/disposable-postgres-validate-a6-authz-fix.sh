#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL validation for Phase A6 auth correction (JWT role service_role).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export LC_ALL=C
export LANG=C

if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
  echo "initdb + pg_ctl are required" >&2
  exit 1
fi

PGROOT="${TMPDIR:-/tmp}/a6-authz-disposable-pg"
PGPORT="55435"
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
"${psql_base[@]}" -c 'create database a6test;' >/dev/null
psql_db=(psql "postgresql://postgres@127.0.0.1:${PGPORT}/a6test?host=${PGSOCK}" -v ON_ERROR_STOP=1)

"${psql_db[@]}" -c 'do $$begin create role anon; exception when duplicate_object then null; end$$;' >/dev/null
"${psql_db[@]}" -c 'do $$begin create role authenticated; exception when duplicate_object then null; end$$;' >/dev/null
"${psql_db[@]}" -c 'do $$begin create role service_role login; exception when duplicate_object then null; end$$;' >/dev/null

apply() {
  local f="$1"
  echo "apply $(basename "$f")"
  "${psql_db[@]}" -f "$f" >/dev/null
}

MIG_DIR="supabase/migrations"
apply "$MIG_DIR/20260804_external_intelligence_phase_a5.sql"
apply "$MIG_DIR/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
apply "$MIG_DIR/20260805_external_intelligence_phase_b2_orchestration.sql"
apply "$MIG_DIR/20260807201000_external_intelligence_phase_a6_rpc_authz_fix.sql"

echo "A6 authz: missing jwt role fails closed"
set +e
OUT="$(${psql_db[@]} -v ON_ERROR_STOP=1 -tA -c "select evidence_reference_id from persist_external_evidence_reference_v1('ev1', repeat('a',64), 'evidence_reference_v1','src','v1','lp','[]'::jsonb,null,null,null,'[]'::jsonb,'{}'::jsonb,'link_only',null,false,null,null,'r',true);" 2>&1)"
set -e
echo "$OUT" | rg -q "unauthorized"

echo "A6 authz: service_role jwt role succeeds (EvidenceReference -> Claim -> Milestone)"

"${psql_db[@]}" <<'SQL' >/dev/null
select set_config('request.jwt.claim.role','service_role', false);
select current_setting('request.jwt.claim.role', true);

select evidence_reference_id from persist_external_evidence_reference_v1(
  'ev1', repeat('a',64), 'evidence_reference_v1',
  'sports.basketball.hoophall.official','v1','lp','[]'::jsonb,
  null,null,null,
  '[]'::jsonb,'{}'::jsonb,
  'link_only',
  null,false,null,null,
  'r',true
);

select claim_id from persist_external_claim_v1(
  'c1', repeat('b',64), 'claim_v1', 'fp1', 'b6.hoophall.deterministic.v1', 'iph',
  'ev1', repeat('a',64),
  '{"object_type":"evidence_reference","object_id":"ev1","content_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
  '[]'::jsonb,
  null,null,null,
  '[]'::jsonb,
  '{"predicate":"milestone_scheduled_for","object":"2027-08-16"}'::jsonb,
  'retain',
  null,false,null,null,
  'reason',
  true,
  'supported_by',
  'provenance/v1',
  'ph'
);

select milestone_id from persist_sports_milestone_v1(
  'sports.hoophall.hall_of_fame_enshrinement.2027-08-16',
  repeat('c',64),
  'sports_milestone_v1',
  '{"schema_version":"sports_milestone_v1","milestone_id":"sports.hoophall.hall_of_fame_enshrinement.2027-08-16","milestone_type":"hall_of_fame_anniversary_or_eligibility","subject_entities":[{"entity_type":"organization","entity_id":"naismith_basketball_hall_of_fame","label":"Naismith Basketball Hall of Fame"}],"team":null,"league":"basketball","geographic_market":"us","original_event_date":null,"milestone_date":"2027-08-16","anniversary_number":null,"season_or_year":"2027","championship_or_achievement_type":"hall_of_fame_enshrinement","historical_significance":"high","fan_collector_relevance":"high","partnership_potential":"medium","licensing_rights_considerations":[],"evidence_refs":[{"label":"Test","url":"https://www.hoophall.com/news/test"}],"source_ids":["sports.basketball.hoophall.official"],"confidence":"high","correction_status":"none","review_status":"unreviewed","content_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb,
  '[{"policy_name":"b6.hoophall","semantic_version":"v1","content_hash":"ph"}]'::jsonb,
  '[{"label":"Test","url":"https://www.hoophall.com/news/test"}]'::jsonb,
  '["sports.basketball.hoophall.official"]'::jsonb,
  'hall_of_fame_anniversary_or_eligibility',
  'naismith_basketball_hall_of_fame',
  '',
  'basketball',
  null,
  '2027-08-16'::date,
  null,
  'original_artwork_no_formal_partnership',
  'high',
  'medium',
  '[]'::jsonb,
  'none'
);
SQL

echo "A6 authz fix disposable validation: OK"

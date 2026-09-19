-- Durable append-only canonical social history plus race-safe sync checkpoints.
-- This is a local persistence boundary only. It never writes to social providers,
-- posts content, sends notifications, or establishes attribution/causality.

begin;

create table exec_dashboard.social_canonical_account_snapshots_v1 (
  canonical_key text primary key check (length(btrim(canonical_key)) > 0),
  snapshot_id text not null unique check (length(btrim(snapshot_id)) > 0),
  platform text not null check (
    platform in ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'X', 'THREADS', 'LINKEDIN')
  ),
  account_id text not null check (length(btrim(account_id)) > 0),
  connector_id text not null check (length(btrim(connector_id)) > 0),
  provider_run_id text not null check (length(btrim(provider_run_id)) > 0),
  retrieved_at timestamptz not null,
  source_state text not null check (
    source_state in ('CONNECTED_AND_INGESTING', 'CONNECTED_PARTIAL')
  ),
  provider_evidence_refs text[] not null check (cardinality(provider_evidence_refs) > 0),
  evidence_refs text[] not null check (cardinality(evidence_refs) > 0),
  snapshot_json jsonb not null check (
    jsonb_typeof(snapshot_json) = 'object'
    and snapshot_json ->> 'contractVersion' = 'CanonicalSocialAccountSnapshotV1'
    and snapshot_json ->> 'snapshotId' = snapshot_id
    and snapshot_json ->> 'platform' = platform
    and snapshot_json ->> 'accountId' = account_id
    and (snapshot_json ->> 'retrievedAt')::timestamptz = retrieved_at
    and snapshot_json -> 'sourceCoverage' ->> 'effectiveState' = source_state
    and snapshot_json ->> 'externalAccessPerformed' = 'false'
    and snapshot_json ->> 'writesPerformed' = 'false'
    and jsonb_typeof(snapshot_json -> 'evidenceRefs') = 'array'
  ),
  persisted_at timestamptz not null default now(),
  constraint social_canonical_snapshot_provider_run_identity_v1 unique (
    platform, connector_id, provider_run_id, account_id
  )
);

create table exec_dashboard.social_canonical_sync_checkpoints_v1 (
  platform text not null check (
    platform in ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'X', 'THREADS', 'LINKEDIN')
  ),
  connector_id text not null check (length(btrim(connector_id)) > 0),
  cursor text null,
  completed_through_at timestamptz null,
  last_run_id text not null check (length(btrim(last_run_id)) > 0),
  last_snapshot_id text not null references exec_dashboard.social_canonical_account_snapshots_v1(snapshot_id),
  updated_at timestamptz not null default now(),
  primary key (platform, connector_id)
);

alter table exec_dashboard.social_canonical_account_snapshots_v1 enable row level security;
alter table exec_dashboard.social_canonical_account_snapshots_v1 force row level security;
alter table exec_dashboard.social_canonical_sync_checkpoints_v1 enable row level security;
alter table exec_dashboard.social_canonical_sync_checkpoints_v1 force row level security;

revoke all on table exec_dashboard.social_canonical_account_snapshots_v1 from public, anon, authenticated, service_role;
revoke all on table exec_dashboard.social_canonical_sync_checkpoints_v1 from public, anon, authenticated, service_role;
grant select on table exec_dashboard.social_canonical_account_snapshots_v1 to service_role;
grant select on table exec_dashboard.social_canonical_sync_checkpoints_v1 to service_role;

create policy social_canonical_account_snapshots_service_read_v1
  on exec_dashboard.social_canonical_account_snapshots_v1
  for select
  to service_role
  using (true);

create policy social_canonical_sync_checkpoints_service_read_v1
  on exec_dashboard.social_canonical_sync_checkpoints_v1
  for select
  to service_role
  using (true);

create or replace function public.persist_social_canonical_snapshot_v1(
  in_canonical_key text,
  in_platform text,
  in_connector_id text,
  in_run_id text,
  in_snapshot_id text,
  in_account_id text,
  in_retrieved_at timestamptz,
  in_source_state text,
  in_provider_evidence_refs text[],
  in_evidence_refs text[],
  in_snapshot_json jsonb,
  in_expected_cursor text,
  in_expected_completed_through_at timestamptz,
  in_next_cursor text,
  in_next_completed_through_at timestamptz
)
returns table(
  status text,
  snapshot_id text,
  checkpoint_completed_through_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_snapshot exec_dashboard.social_canonical_account_snapshots_v1%rowtype;
  current_checkpoint exec_dashboard.social_canonical_sync_checkpoints_v1%rowtype;
  checkpoint_exists boolean := false;
  snapshot_exists boolean := false;
  checkpoint_at_target boolean := false;
  affected_rows integer := 0;
  ref text;
  provider_ref_count integer;
  provider_ref_distinct_count integer;
  canonical_ref_count integer;
  canonical_ref_distinct_count integer;
begin
  if in_platform is null or in_platform not in ('INSTAGRAM', 'FACEBOOK', 'YOUTUBE', 'TIKTOK', 'X', 'THREADS', 'LINKEDIN') then
    raise exception using errcode = '22023', message = 'social_persistence_platform_invalid';
  end if;
  if nullif(btrim(in_connector_id), '') is null
     or nullif(btrim(in_run_id), '') is null
     or nullif(btrim(in_snapshot_id), '') is null
     or nullif(btrim(in_account_id), '') is null
     or nullif(btrim(in_canonical_key), '') is null then
    raise exception using errcode = '22023', message = 'social_persistence_identity_missing';
  end if;
  if in_canonical_key is distinct from (in_platform || ':' || in_account_id || ':' || in_snapshot_id) then
    raise exception using errcode = '22023', message = 'social_persistence_canonical_key_mismatch';
  end if;
  if in_retrieved_at is null or in_next_completed_through_at is null then
    raise exception using errcode = '22023', message = 'social_persistence_checkpoint_time_missing';
  end if;
  if in_retrieved_at > clock_timestamp() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'social_persistence_future_retrieval';
  end if;
  if in_next_cursor is not null or in_next_completed_through_at is distinct from in_retrieved_at then
    raise exception using errcode = '22023', message = 'social_persistence_success_checkpoint_invalid';
  end if;
  if in_expected_completed_through_at is not null
     and in_expected_completed_through_at > in_next_completed_through_at then
    raise exception using errcode = '22023', message = 'social_persistence_checkpoint_regression';
  end if;
  if in_source_state not in ('CONNECTED_AND_INGESTING', 'CONNECTED_PARTIAL') then
    raise exception using errcode = '22023', message = 'social_persistence_source_state_not_live';
  end if;
  if in_snapshot_json is null or jsonb_typeof(in_snapshot_json) <> 'object' then
    raise exception using errcode = '22023', message = 'social_persistence_snapshot_invalid';
  end if;
  if in_snapshot_json ->> 'contractVersion' is distinct from 'CanonicalSocialAccountSnapshotV1'
     or in_snapshot_json ->> 'snapshotId' is distinct from in_snapshot_id
     or in_snapshot_json ->> 'platform' is distinct from in_platform
     or in_snapshot_json ->> 'accountId' is distinct from in_account_id
     or (in_snapshot_json ->> 'retrievedAt')::timestamptz is distinct from in_retrieved_at
     or in_snapshot_json -> 'sourceCoverage' ->> 'effectiveState' is distinct from in_source_state
     or in_snapshot_json ->> 'externalAccessPerformed' is distinct from 'false'
     or in_snapshot_json ->> 'writesPerformed' is distinct from 'false' then
    raise exception using errcode = '22023', message = 'social_persistence_snapshot_binding_mismatch';
  end if;
  if jsonb_typeof(in_snapshot_json -> 'evidenceRefs') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'social_persistence_snapshot_evidence_invalid';
  end if;
  if in_provider_evidence_refs is null or cardinality(in_provider_evidence_refs) = 0
     or in_evidence_refs is null or cardinality(in_evidence_refs) = 0 then
    raise exception using errcode = '22023', message = 'social_persistence_provenance_missing';
  end if;
  if in_snapshot_json -> 'evidenceRefs' is distinct from to_jsonb(in_evidence_refs) then
    raise exception using errcode = '22023', message = 'social_persistence_canonical_evidence_mismatch';
  end if;

  select count(*), count(distinct btrim(value))
    into provider_ref_count, provider_ref_distinct_count
  from unnest(in_provider_evidence_refs) as refs(value);
  select count(*), count(distinct btrim(value))
    into canonical_ref_count, canonical_ref_distinct_count
  from unnest(in_evidence_refs) as refs(value);
  if provider_ref_count <> provider_ref_distinct_count
     or canonical_ref_count <> canonical_ref_distinct_count then
    raise exception using errcode = '22023', message = 'social_persistence_duplicate_evidence_ref';
  end if;

  foreach ref in array (in_provider_evidence_refs || in_evidence_refs) loop
    if nullif(btrim(ref), '') is null or length(ref) > 2000 then
      raise exception using errcode = '22023', message = 'social_persistence_evidence_ref_invalid';
    end if;
    if lower(btrim(ref)) ~ '^(op://|bearer[[:space:]])'
       or lower(ref) ~ '(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)[[:space:]]*[:=]'
       or lower(ref) ~ '[?&](access_token|token|api_key|apikey|signature|secret)=' then
      raise exception using errcode = '22023', message = 'social_persistence_evidence_contains_secret';
    end if;
  end loop;

  -- Serialize checkpoint mutation even when the checkpoint row does not exist yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(in_platform || ':' || in_connector_id));

  select c.*
    into current_checkpoint
  from exec_dashboard.social_canonical_sync_checkpoints_v1 c
  where c.platform = in_platform
    and c.connector_id = in_connector_id
  for update;
  checkpoint_exists := found;

  select s.*
    into existing_snapshot
  from exec_dashboard.social_canonical_account_snapshots_v1 s
  where s.canonical_key = in_canonical_key
     or s.snapshot_id = in_snapshot_id
  limit 1;
  snapshot_exists := found;

  if snapshot_exists and (
    existing_snapshot.canonical_key is distinct from in_canonical_key
    or existing_snapshot.snapshot_id is distinct from in_snapshot_id
    or existing_snapshot.platform is distinct from in_platform
    or existing_snapshot.account_id is distinct from in_account_id
    or existing_snapshot.connector_id is distinct from in_connector_id
    or existing_snapshot.provider_run_id is distinct from in_run_id
    or existing_snapshot.retrieved_at is distinct from in_retrieved_at
    or existing_snapshot.source_state is distinct from in_source_state
    or existing_snapshot.provider_evidence_refs is distinct from in_provider_evidence_refs
    or existing_snapshot.evidence_refs is distinct from in_evidence_refs
    or existing_snapshot.snapshot_json is distinct from in_snapshot_json
  ) then
    raise exception using errcode = '23505', message = 'social_persistence_snapshot_conflict';
  end if;

  checkpoint_at_target := checkpoint_exists
    and current_checkpoint.cursor is not distinct from in_next_cursor
    and current_checkpoint.completed_through_at is not distinct from in_next_completed_through_at
    and current_checkpoint.last_snapshot_id is not distinct from in_snapshot_id;

  if checkpoint_at_target then
    if not snapshot_exists then
      raise exception using errcode = '40001', message = 'social_persistence_checkpoint_ahead_of_snapshot';
    end if;
    return query select 'IDEMPOTENT'::text, in_snapshot_id, in_next_completed_through_at;
    return;
  end if;

  if checkpoint_exists then
    if current_checkpoint.cursor is distinct from in_expected_cursor
       or current_checkpoint.completed_through_at is distinct from in_expected_completed_through_at then
      raise exception using errcode = '40001', message = 'social_persistence_checkpoint_compare_and_set_failed';
    end if;
    if current_checkpoint.completed_through_at is not null
       and current_checkpoint.completed_through_at > in_next_completed_through_at then
      raise exception using errcode = '40001', message = 'social_persistence_checkpoint_regression';
    end if;
  elsif in_expected_cursor is not null or in_expected_completed_through_at is not null then
    raise exception using errcode = '40001', message = 'social_persistence_expected_checkpoint_missing';
  end if;

  if not snapshot_exists then
    insert into exec_dashboard.social_canonical_account_snapshots_v1 (
      canonical_key,
      snapshot_id,
      platform,
      account_id,
      connector_id,
      provider_run_id,
      retrieved_at,
      source_state,
      provider_evidence_refs,
      evidence_refs,
      snapshot_json
    ) values (
      in_canonical_key,
      in_snapshot_id,
      in_platform,
      in_account_id,
      in_connector_id,
      in_run_id,
      in_retrieved_at,
      in_source_state,
      in_provider_evidence_refs,
      in_evidence_refs,
      in_snapshot_json
    );
  end if;

  if checkpoint_exists then
    update exec_dashboard.social_canonical_sync_checkpoints_v1
    set
      cursor = in_next_cursor,
      completed_through_at = in_next_completed_through_at,
      last_run_id = in_run_id,
      last_snapshot_id = in_snapshot_id,
      updated_at = now()
    where platform = in_platform
      and connector_id = in_connector_id
      and cursor is not distinct from in_expected_cursor
      and completed_through_at is not distinct from in_expected_completed_through_at;

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using errcode = '40001', message = 'social_persistence_checkpoint_compare_and_set_failed';
    end if;
  else
    insert into exec_dashboard.social_canonical_sync_checkpoints_v1 (
      platform,
      connector_id,
      cursor,
      completed_through_at,
      last_run_id,
      last_snapshot_id
    ) values (
      in_platform,
      in_connector_id,
      in_next_cursor,
      in_next_completed_through_at,
      in_run_id,
      in_snapshot_id
    );
  end if;

  return query select
    case when snapshot_exists then 'CHECKPOINT_ADVANCED'::text else 'APPLIED'::text end,
    in_snapshot_id,
    in_next_completed_through_at;
end;
$function$;

revoke all on function public.persist_social_canonical_snapshot_v1(
  text, text, text, text, text, text, timestamptz, text, text[], text[], jsonb,
  text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.persist_social_canonical_snapshot_v1(
  text, text, text, text, text, text, timestamptz, text, text[], text[], jsonb,
  text, timestamptz, text, timestamptz
) to service_role;

commit;

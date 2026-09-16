-- Durable canonical Microsoft Clarity ingestion snapshots.
-- The server-side application role is the only writer and reader. The public
-- projection exists for PostgREST discovery but retains invoker permissions.

begin;

create table exec_dashboard.clarity_ingestion_snapshots_v1 (
  snapshot_id text primary key,
  canonical_fingerprint text not null unique,
  project_id text not null check (length(btrim(project_id)) > 0),
  reporting_window_start timestamptz not null,
  reporting_window_end timestamptz not null,
  reporting_timezone text not null check (reporting_timezone = 'America/Los_Angeles'),
  partial_day boolean not null,
  extracted_at timestamptz not null,
  source_state text not null check (source_state in ('AVAILABLE', 'PARTIAL', 'STALE', 'UNKNOWN', 'UNAVAILABLE')),
  source_reason text null,
  empty_snapshot boolean not null,
  evidence_refs text[] not null default '{}',
  snapshot_json jsonb not null check (
    jsonb_typeof(snapshot_json) = 'object'
    and snapshot_json ->> 'contractVersion' = 'ClarityIngestionSnapshotV1'
    and snapshot_json ->> 'snapshotId' = snapshot_id
    and snapshot_json ->> 'projectId' = project_id
    and snapshot_json ->> 'sourceState' = source_state
    and snapshot_json -> 'reportingWindow' ->> 'timeZone' = reporting_timezone
    and (snapshot_json -> 'reportingWindow' ->> 'partialDay')::boolean = partial_day
    and (snapshot_json ->> 'extractedAt')::timestamptz = extracted_at
  ),
  persisted_at timestamptz not null default now(),
  constraint clarity_ingestion_snapshots_window_order_v1 check (
    reporting_window_start < reporting_window_end
  ),
  constraint clarity_ingestion_snapshots_identity_v1 unique (
    project_id, reporting_window_start, reporting_window_end
  )
);

alter table exec_dashboard.clarity_ingestion_snapshots_v1 enable row level security;
alter table exec_dashboard.clarity_ingestion_snapshots_v1 force row level security;

revoke all on table exec_dashboard.clarity_ingestion_snapshots_v1 from public, anon, authenticated;
grant select, insert on table exec_dashboard.clarity_ingestion_snapshots_v1 to service_role;

create policy clarity_ingestion_snapshots_service_read_v1
  on exec_dashboard.clarity_ingestion_snapshots_v1
  for select
  to service_role
  using (true);

create policy clarity_ingestion_snapshots_service_insert_v1
  on exec_dashboard.clarity_ingestion_snapshots_v1
  for insert
  to service_role
  with check (true);

create or replace view public.clarity_ingestion_snapshots_v1
with (security_invoker = true) as
select
  snapshot_id,
  canonical_fingerprint,
  project_id,
  reporting_window_start,
  reporting_window_end,
  reporting_timezone,
  partial_day,
  extracted_at,
  source_state,
  source_reason,
  empty_snapshot,
  evidence_refs,
  snapshot_json,
  persisted_at
from exec_dashboard.clarity_ingestion_snapshots_v1;

revoke all on table public.clarity_ingestion_snapshots_v1 from public, anon, authenticated;
grant select on table public.clarity_ingestion_snapshots_v1 to service_role;

create or replace function public.persist_clarity_ingestion_snapshot_v1(
  in_snapshot_id text,
  in_canonical_fingerprint text,
  in_project_id text,
  in_reporting_window_start timestamptz,
  in_reporting_window_end timestamptz,
  in_reporting_timezone text,
  in_partial_day boolean,
  in_extracted_at timestamptz,
  in_source_state text,
  in_source_reason text,
  in_empty_snapshot boolean,
  in_evidence_refs text[],
  in_snapshot_json jsonb
)
returns table(status text, snapshot_id text, canonical_fingerprint text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  existing_snapshot_id text;
  existing_fingerprint text;
begin
  if in_reporting_timezone <> 'America/Los_Angeles' then
    raise exception using errcode = '22023', message = 'clarity_reporting_timezone_invalid';
  end if;

  insert into exec_dashboard.clarity_ingestion_snapshots_v1 (
    snapshot_id,
    canonical_fingerprint,
    project_id,
    reporting_window_start,
    reporting_window_end,
    reporting_timezone,
    partial_day,
    extracted_at,
    source_state,
    source_reason,
    empty_snapshot,
    evidence_refs,
    snapshot_json
  ) values (
    in_snapshot_id,
    in_canonical_fingerprint,
    in_project_id,
    in_reporting_window_start,
    in_reporting_window_end,
    in_reporting_timezone,
    in_partial_day,
    in_extracted_at,
    in_source_state,
    nullif(btrim(in_source_reason), ''),
    in_empty_snapshot,
    coalesce(in_evidence_refs, '{}'),
    in_snapshot_json
  )
  on conflict (project_id, reporting_window_start, reporting_window_end) do nothing
  returning
    clarity_ingestion_snapshots_v1.snapshot_id,
    clarity_ingestion_snapshots_v1.canonical_fingerprint
  into existing_snapshot_id, existing_fingerprint;

  if existing_snapshot_id is not null then
    return query select 'PERSISTED'::text, existing_snapshot_id, existing_fingerprint;
    return;
  end if;

  select s.snapshot_id, s.canonical_fingerprint
    into existing_snapshot_id, existing_fingerprint
  from exec_dashboard.clarity_ingestion_snapshots_v1 s
  where s.project_id = in_project_id
    and s.reporting_window_start = in_reporting_window_start
    and s.reporting_window_end = in_reporting_window_end;

  if existing_fingerprint = in_canonical_fingerprint then
    return query select 'IDEMPOTENT'::text, existing_snapshot_id, existing_fingerprint;
  else
    return query select 'CONFLICTING'::text, existing_snapshot_id, existing_fingerprint;
  end if;
end;
$function$;

revoke all on function public.persist_clarity_ingestion_snapshot_v1(
  text, text, text, timestamptz, timestamptz, text, boolean, timestamptz,
  text, text, boolean, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.persist_clarity_ingestion_snapshot_v1(
  text, text, text, timestamptz, timestamptz, text, boolean, timestamptz,
  text, text, boolean, text[], jsonb
) to service_role;

commit;

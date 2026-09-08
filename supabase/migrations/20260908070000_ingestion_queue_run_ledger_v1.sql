-- Canonical ingestion queue and run ledger.
-- Additive only. This migration does not activate collectors or schedules.

begin;

create schema if not exists ingestion_private;

revoke all on schema ingestion_private from public, anon, authenticated;
grant usage on schema ingestion_private to service_role;

create table ingestion_private.ingestion_jobs_v1 (
  job_id uuid primary key default gen_random_uuid(),
  source_id text not null check (source_id ~ '^[a-z0-9][a-z0-9._-]+$'),
  manifest_version text not null check (length(btrim(manifest_version)) > 0),
  adapter_identity text not null check (length(btrim(adapter_identity)) > 0),
  execution_venue text not null check (
    execution_venue in ('DASHBOARD_WORKER', 'GITHUB_ACTIONS', 'LOCAL_AUTHORIZED_WORKER')
  ),
  job_kind text not null check (job_kind in ('INCREMENTAL', 'BACKFILL', 'RECONCILIATION')),
  priority smallint not null default 50 check (priority between 0 and 100),
  state text not null default 'QUEUED' check (
    state in ('QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'DEAD_LETTERED', 'CANCELLED')
  ),
  due_at timestamptz not null default now(),
  idempotency_key text not null check (length(btrim(idempotency_key)) > 0),
  input_fingerprint text not null check (length(btrim(input_fingerprint)) > 0),
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  cursor_before jsonb null,
  cursor_after jsonb null,
  target_coverage_start timestamptz null,
  target_coverage_end timestamptz null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  maximum_attempts integer not null check (maximum_attempts between 1 and 20),
  retry_base_seconds integer not null check (retry_base_seconds between 1 and 86400),
  retry_max_seconds integer not null check (retry_max_seconds between retry_base_seconds and 604800),
  lease_owner text null,
  lease_token uuid null,
  lease_acquired_at timestamptz null,
  lease_expires_at timestamptz null,
  completed_at timestamptz null,
  last_error_code text null,
  last_error_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingestion_jobs_v1_source_idempotency_unique unique (source_id, idempotency_key),
  constraint ingestion_jobs_v1_coverage_order check (
    target_coverage_start is null
    or target_coverage_end is null
    or target_coverage_start <= target_coverage_end
  ),
  constraint ingestion_jobs_v1_lease_shape check (
    (
      state in ('CLAIMED', 'RUNNING')
      and lease_owner is not null
      and lease_token is not null
      and lease_acquired_at is not null
      and lease_expires_at is not null
    )
    or (
      state not in ('CLAIMED', 'RUNNING')
      and lease_owner is null
      and lease_token is null
      and lease_acquired_at is null
      and lease_expires_at is null
    )
  )
);

create unique index ingestion_jobs_v1_one_active_per_source_idx
  on ingestion_private.ingestion_jobs_v1 (source_id)
  where state in ('CLAIMED', 'RUNNING');

create index ingestion_jobs_v1_due_idx
  on ingestion_private.ingestion_jobs_v1 (priority desc, due_at asc, created_at asc)
  where state in ('QUEUED', 'RETRY_WAIT');

create index ingestion_jobs_v1_expired_lease_idx
  on ingestion_private.ingestion_jobs_v1 (lease_expires_at asc)
  where state in ('CLAIMED', 'RUNNING');

create table ingestion_private.ingestion_runs_v1 (
  run_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references ingestion_private.ingestion_jobs_v1(job_id) on delete restrict,
  source_id text not null,
  attempt_number integer not null check (attempt_number > 0),
  worker_id text not null,
  lease_token uuid not null,
  state text not null check (
    state in ('CLAIMED', 'RUNNING', 'SUCCEEDED', 'RETRY_SCHEDULED', 'DEAD_LETTERED')
  ),
  claimed_at timestamptz not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  source_as_of timestamptz null,
  coverage_start timestamptz null,
  coverage_end timestamptz null,
  cursor_before jsonb null,
  cursor_after jsonb null,
  raw_artifact_reference text null,
  content_hash text null,
  result_json jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  error_code text null,
  error_summary text null,
  created_at timestamptz not null default now(),
  constraint ingestion_runs_v1_job_attempt_unique unique (job_id, attempt_number),
  constraint ingestion_runs_v1_coverage_order check (
    coverage_start is null or coverage_end is null or coverage_start <= coverage_end
  )
);

create index ingestion_runs_v1_job_idx
  on ingestion_private.ingestion_runs_v1 (job_id, attempt_number desc);

create index ingestion_runs_v1_source_finished_idx
  on ingestion_private.ingestion_runs_v1 (source_id, finished_at desc);

create table ingestion_private.ingestion_run_events_v1 (
  event_id bigint generated always as identity primary key,
  job_id uuid not null references ingestion_private.ingestion_jobs_v1(job_id) on delete restrict,
  run_id uuid null references ingestion_private.ingestion_runs_v1(run_id) on delete restrict,
  source_id text not null,
  event_type text not null check (
    event_type in ('ENQUEUED', 'CLAIMED', 'RUNNING', 'HEARTBEAT', 'SUCCEEDED', 'RETRY_SCHEDULED', 'DEAD_LETTERED', 'LEASE_EXPIRED')
  ),
  event_at timestamptz not null default now(),
  details_json jsonb not null default '{}'::jsonb check (jsonb_typeof(details_json) = 'object')
);

create index ingestion_run_events_v1_job_idx
  on ingestion_private.ingestion_run_events_v1 (job_id, event_id);

create table ingestion_private.ingestion_dead_letters_v1 (
  dead_letter_id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references ingestion_private.ingestion_jobs_v1(job_id) on delete restrict,
  run_id uuid not null references ingestion_private.ingestion_runs_v1(run_id) on delete restrict,
  source_id text not null,
  final_attempt_number integer not null check (final_attempt_number > 0),
  error_code text not null,
  error_summary text not null,
  payload_json jsonb not null,
  input_fingerprint text not null,
  dead_lettered_at timestamptz not null default now()
);

create index ingestion_dead_letters_v1_source_idx
  on ingestion_private.ingestion_dead_letters_v1 (source_id, dead_lettered_at desc);

alter table ingestion_private.ingestion_jobs_v1 enable row level security;
alter table ingestion_private.ingestion_jobs_v1 force row level security;
alter table ingestion_private.ingestion_runs_v1 enable row level security;
alter table ingestion_private.ingestion_runs_v1 force row level security;
alter table ingestion_private.ingestion_run_events_v1 enable row level security;
alter table ingestion_private.ingestion_run_events_v1 force row level security;
alter table ingestion_private.ingestion_dead_letters_v1 enable row level security;
alter table ingestion_private.ingestion_dead_letters_v1 force row level security;

revoke all on all tables in schema ingestion_private from public, anon, authenticated;
revoke all on all sequences in schema ingestion_private from public, anon, authenticated;
grant select, insert, update on ingestion_private.ingestion_jobs_v1 to service_role;
grant select, insert, update on ingestion_private.ingestion_runs_v1 to service_role;
grant select, insert on ingestion_private.ingestion_run_events_v1 to service_role;
grant select, insert on ingestion_private.ingestion_dead_letters_v1 to service_role;
grant usage, select on all sequences in schema ingestion_private to service_role;

create or replace function public.enqueue_ingestion_job_v1(
  in_source_id text,
  in_manifest_version text,
  in_adapter_identity text,
  in_execution_venue text,
  in_job_kind text,
  in_priority integer,
  in_due_at timestamptz,
  in_idempotency_key text,
  in_input_fingerprint text,
  in_payload_json jsonb,
  in_cursor_before jsonb,
  in_target_coverage_start timestamptz,
  in_target_coverage_end timestamptz,
  in_maximum_attempts integer,
  in_retry_base_seconds integer,
  in_retry_max_seconds integer
)
returns table(job_id uuid, state text, created_new boolean)
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_job_id uuid;
  v_existing_fingerprint text;
begin
  insert into ingestion_private.ingestion_jobs_v1 (
    source_id, manifest_version, adapter_identity, execution_venue, job_kind,
    priority, due_at, idempotency_key, input_fingerprint, payload_json,
    cursor_before, target_coverage_start, target_coverage_end,
    maximum_attempts, retry_base_seconds, retry_max_seconds
  ) values (
    in_source_id, in_manifest_version, in_adapter_identity, in_execution_venue, in_job_kind,
    in_priority, coalesce(in_due_at, now()), in_idempotency_key, in_input_fingerprint,
    coalesce(in_payload_json, '{}'::jsonb), in_cursor_before,
    in_target_coverage_start, in_target_coverage_end,
    in_maximum_attempts, in_retry_base_seconds, in_retry_max_seconds
  )
  on conflict (source_id, idempotency_key) do nothing
  returning ingestion_private.ingestion_jobs_v1.job_id into v_job_id;

  if v_job_id is not null then
    insert into ingestion_private.ingestion_run_events_v1(job_id, source_id, event_type)
    values (v_job_id, in_source_id, 'ENQUEUED');
    return query select v_job_id, 'QUEUED'::text, true;
    return;
  end if;

  select j.job_id, j.input_fingerprint
    into v_job_id, v_existing_fingerprint
  from ingestion_private.ingestion_jobs_v1 j
  where j.source_id = in_source_id and j.idempotency_key = in_idempotency_key;

  if v_existing_fingerprint is distinct from in_input_fingerprint then
    raise exception 'ingestion_idempotency_conflict' using errcode = '23505';
  end if;

  return query
    select j.job_id, j.state, false
    from ingestion_private.ingestion_jobs_v1 j
    where j.job_id = v_job_id;
end;
$fn$;

create or replace function public.claim_ingestion_job_v1(
  in_worker_id text,
  in_execution_venue text,
  in_lease_seconds integer
)
returns table(
  job_id uuid,
  run_id uuid,
  source_id text,
  adapter_identity text,
  execution_venue text,
  job_kind text,
  attempt_number integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  payload_json jsonb,
  cursor_before jsonb,
  target_coverage_start timestamptz,
  target_coverage_end timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_job ingestion_private.ingestion_jobs_v1%rowtype;
  v_run_id uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
begin
  if nullif(btrim(in_worker_id), '') is null
    or in_execution_venue not in ('DASHBOARD_WORKER', 'GITHUB_ACTIONS', 'LOCAL_AUTHORIZED_WORKER')
    or in_lease_seconds not between 5 and 3600
  then
    raise exception 'invalid_ingestion_claim' using errcode = '22023';
  end if;

  select j.* into v_job
  from ingestion_private.ingestion_jobs_v1 j
  where j.state in ('QUEUED', 'RETRY_WAIT')
    and j.execution_venue = in_execution_venue
    and j.due_at <= now()
    and j.attempt_count < j.maximum_attempts
    and not exists (
      select 1
      from ingestion_private.ingestion_jobs_v1 active
      where active.source_id = j.source_id
        and active.state in ('CLAIMED', 'RUNNING')
    )
  order by j.priority desc, j.due_at asc, j.created_at asc
  for update skip locked
  limit 1;

  if v_job.job_id is null then
    return;
  end if;

  begin
    update ingestion_private.ingestion_jobs_v1 j
    set state = 'CLAIMED',
        attempt_count = j.attempt_count + 1,
        lease_owner = in_worker_id,
        lease_token = v_lease_token,
        lease_acquired_at = now(),
        lease_expires_at = now() + make_interval(secs => in_lease_seconds),
        updated_at = now()
    where j.job_id = v_job.job_id
    returning j.* into v_job;
  exception when unique_violation then
    return;
  end;

  insert into ingestion_private.ingestion_runs_v1(
    run_id, job_id, source_id, attempt_number, worker_id, lease_token,
    state, claimed_at, cursor_before
  ) values (
    v_run_id, v_job.job_id, v_job.source_id, v_job.attempt_count, in_worker_id,
    v_lease_token, 'CLAIMED', now(), v_job.cursor_before
  );

  insert into ingestion_private.ingestion_run_events_v1(
    job_id, run_id, source_id, event_type, details_json
  ) values (
    v_job.job_id, v_run_id, v_job.source_id, 'CLAIMED',
    jsonb_build_object('attempt_number', v_job.attempt_count, 'lease_expires_at', v_job.lease_expires_at)
  );

  return query select
    v_job.job_id, v_run_id, v_job.source_id, v_job.adapter_identity,
    v_job.execution_venue, v_job.job_kind, v_job.attempt_count,
    v_lease_token, v_job.lease_expires_at, v_job.payload_json,
    v_job.cursor_before, v_job.target_coverage_start, v_job.target_coverage_end;
end;
$fn$;

create or replace function public.start_ingestion_run_v1(
  in_job_id uuid,
  in_run_id uuid,
  in_worker_id text,
  in_lease_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_source_id text;
begin
  update ingestion_private.ingestion_jobs_v1 j
  set state = 'RUNNING', updated_at = now()
  where j.job_id = in_job_id
    and j.state = 'CLAIMED'
    and j.lease_owner = in_worker_id
    and j.lease_token = in_lease_token
    and j.lease_expires_at > now()
    and exists (
      select 1
      from ingestion_private.ingestion_runs_v1 r
      where r.run_id = in_run_id
        and r.job_id = j.job_id
        and r.lease_token = in_lease_token
        and r.state = 'CLAIMED'
    )
  returning j.source_id into v_source_id;

  if v_source_id is null then return false; end if;

  update ingestion_private.ingestion_runs_v1 r
  set state = 'RUNNING', started_at = now()
  where r.run_id = in_run_id and r.job_id = in_job_id and r.lease_token = in_lease_token;

  insert into ingestion_private.ingestion_run_events_v1(job_id, run_id, source_id, event_type)
  values (in_job_id, in_run_id, v_source_id, 'RUNNING');
  return true;
end;
$fn$;

create or replace function public.heartbeat_ingestion_run_v1(
  in_job_id uuid,
  in_run_id uuid,
  in_worker_id text,
  in_lease_token uuid,
  in_lease_seconds integer
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_expires_at timestamptz;
  v_source_id text;
begin
  if in_lease_seconds not between 5 and 3600 then
    raise exception 'invalid_ingestion_heartbeat' using errcode = '22023';
  end if;

  update ingestion_private.ingestion_jobs_v1 j
  set lease_expires_at = now() + make_interval(secs => in_lease_seconds), updated_at = now()
  where j.job_id = in_job_id
    and j.state in ('CLAIMED', 'RUNNING')
    and j.lease_owner = in_worker_id
    and j.lease_token = in_lease_token
    and j.lease_expires_at > now()
    and exists (
      select 1
      from ingestion_private.ingestion_runs_v1 r
      where r.run_id = in_run_id
        and r.job_id = j.job_id
        and r.lease_token = in_lease_token
        and r.state in ('CLAIMED', 'RUNNING')
    )
  returning j.lease_expires_at, j.source_id into v_expires_at, v_source_id;

  if v_expires_at is not null then
    insert into ingestion_private.ingestion_run_events_v1(
      job_id, run_id, source_id, event_type, details_json
    ) values (
      in_job_id, in_run_id, v_source_id, 'HEARTBEAT',
      jsonb_build_object('lease_expires_at', v_expires_at)
    );
  end if;
  return v_expires_at;
end;
$fn$;

create or replace function public.complete_ingestion_run_v1(
  in_job_id uuid,
  in_run_id uuid,
  in_worker_id text,
  in_lease_token uuid,
  in_source_as_of timestamptz,
  in_coverage_start timestamptz,
  in_coverage_end timestamptz,
  in_cursor_after jsonb,
  in_raw_artifact_reference text,
  in_content_hash text,
  in_result_json jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_source_id text;
begin
  if in_source_as_of is null
    or nullif(btrim(in_raw_artifact_reference), '') is null
    or nullif(btrim(in_content_hash), '') is null
    or (in_coverage_start is not null and in_coverage_end is not null and in_coverage_start > in_coverage_end)
  then
    raise exception 'incomplete_ingestion_evidence' using errcode = '22023';
  end if;

  update ingestion_private.ingestion_jobs_v1 j
  set state = 'SUCCEEDED', cursor_after = in_cursor_after, completed_at = now(),
      lease_owner = null, lease_token = null, lease_acquired_at = null, lease_expires_at = null,
      last_error_code = null, last_error_summary = null,
      updated_at = now()
  where j.job_id = in_job_id
    and j.state in ('CLAIMED', 'RUNNING')
    and j.lease_owner = in_worker_id
    and j.lease_token = in_lease_token
    and j.lease_expires_at > now()
    and exists (
      select 1
      from ingestion_private.ingestion_runs_v1 r
      where r.run_id = in_run_id
        and r.job_id = j.job_id
        and r.lease_token = in_lease_token
        and r.state in ('CLAIMED', 'RUNNING')
    )
  returning j.source_id into v_source_id;

  if v_source_id is null then return false; end if;

  update ingestion_private.ingestion_runs_v1 r
  set state = 'SUCCEEDED', finished_at = now(), source_as_of = in_source_as_of,
      coverage_start = in_coverage_start, coverage_end = in_coverage_end,
      cursor_after = in_cursor_after, raw_artifact_reference = in_raw_artifact_reference,
      content_hash = in_content_hash, result_json = coalesce(in_result_json, '{}'::jsonb)
  where r.run_id = in_run_id and r.job_id = in_job_id and r.lease_token = in_lease_token;

  insert into ingestion_private.ingestion_run_events_v1(job_id, run_id, source_id, event_type)
  values (in_job_id, in_run_id, v_source_id, 'SUCCEEDED');
  return true;
end;
$fn$;

create or replace function public.fail_ingestion_run_v1(
  in_job_id uuid,
  in_run_id uuid,
  in_worker_id text,
  in_lease_token uuid,
  in_error_code text,
  in_error_summary text,
  in_result_json jsonb
)
returns table(state text, retry_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_job ingestion_private.ingestion_jobs_v1%rowtype;
  v_retry_at timestamptz;
  v_next_state text;
begin
  if nullif(btrim(in_error_code), '') is null or nullif(btrim(in_error_summary), '') is null then
    raise exception 'incomplete_ingestion_failure' using errcode = '22023';
  end if;

  select j.* into v_job
  from ingestion_private.ingestion_jobs_v1 j
  where j.job_id = in_job_id
    and j.state in ('CLAIMED', 'RUNNING')
    and j.lease_owner = in_worker_id
    and j.lease_token = in_lease_token
    and j.lease_expires_at > now()
    and exists (
      select 1
      from ingestion_private.ingestion_runs_v1 r
      where r.run_id = in_run_id
        and r.job_id = j.job_id
        and r.lease_token = in_lease_token
        and r.state in ('CLAIMED', 'RUNNING')
    )
  for update;

  if v_job.job_id is null then return; end if;

  if v_job.attempt_count < v_job.maximum_attempts then
    v_next_state := 'RETRY_WAIT';
    v_retry_at := now() + make_interval(secs => least(
      v_job.retry_max_seconds::numeric,
      v_job.retry_base_seconds::numeric * power(2::numeric, greatest(v_job.attempt_count - 1, 0))
    )::integer);
  else
    v_next_state := 'DEAD_LETTERED';
    v_retry_at := null;
  end if;

  update ingestion_private.ingestion_jobs_v1 j
  set state = v_next_state, due_at = coalesce(v_retry_at, j.due_at),
      completed_at = case when v_next_state = 'DEAD_LETTERED' then now() else null end,
      lease_owner = null, lease_token = null, lease_acquired_at = null, lease_expires_at = null,
      last_error_code = in_error_code, last_error_summary = in_error_summary, updated_at = now()
  where j.job_id = in_job_id;

  update ingestion_private.ingestion_runs_v1 r
  set state = case when v_next_state = 'RETRY_WAIT' then 'RETRY_SCHEDULED' else 'DEAD_LETTERED' end,
      finished_at = now(), error_code = in_error_code, error_summary = in_error_summary,
      result_json = coalesce(in_result_json, '{}'::jsonb)
  where r.run_id = in_run_id and r.job_id = in_job_id and r.lease_token = in_lease_token;

  insert into ingestion_private.ingestion_run_events_v1(
    job_id, run_id, source_id, event_type, details_json
  ) values (
    in_job_id, in_run_id, v_job.source_id,
    case when v_next_state = 'RETRY_WAIT' then 'RETRY_SCHEDULED' else 'DEAD_LETTERED' end,
    jsonb_build_object('error_code', in_error_code, 'retry_at', v_retry_at)
  );

  if v_next_state = 'DEAD_LETTERED' then
    insert into ingestion_private.ingestion_dead_letters_v1(
      job_id, run_id, source_id, final_attempt_number, error_code, error_summary,
      payload_json, input_fingerprint
    ) values (
      in_job_id, in_run_id, v_job.source_id, v_job.attempt_count, in_error_code,
      in_error_summary, v_job.payload_json, v_job.input_fingerprint
    ) on conflict (job_id) do nothing;
  end if;

  return query select v_next_state, v_retry_at;
end;
$fn$;

create or replace function public.recover_expired_ingestion_leases_v1(in_limit integer default 100)
returns table(recovered_count integer, retry_count integer, dead_letter_count integer)
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_job ingestion_private.ingestion_jobs_v1%rowtype;
  v_run_id uuid;
  v_retry_at timestamptz;
  v_recovered integer := 0;
  v_retried integer := 0;
  v_dead integer := 0;
begin
  if in_limit not between 1 and 1000 then
    raise exception 'invalid_recovery_limit' using errcode = '22023';
  end if;

  for v_job in
    select j.*
    from ingestion_private.ingestion_jobs_v1 j
    where j.state in ('CLAIMED', 'RUNNING') and j.lease_expires_at <= now()
    order by j.lease_expires_at asc
    for update skip locked
    limit in_limit
  loop
    select r.run_id into v_run_id
    from ingestion_private.ingestion_runs_v1 r
    where r.job_id = v_job.job_id and r.attempt_number = v_job.attempt_count;

    insert into ingestion_private.ingestion_run_events_v1(
      job_id, run_id, source_id, event_type, details_json
    ) values (
      v_job.job_id, v_run_id, v_job.source_id, 'LEASE_EXPIRED',
      jsonb_build_object('expired_at', v_job.lease_expires_at)
    );

    if v_job.attempt_count < v_job.maximum_attempts then
      v_retry_at := now() + make_interval(secs => least(
        v_job.retry_max_seconds::numeric,
        v_job.retry_base_seconds::numeric * power(2::numeric, greatest(v_job.attempt_count - 1, 0))
      )::integer);
      update ingestion_private.ingestion_jobs_v1 j
      set state = 'RETRY_WAIT', due_at = v_retry_at,
          lease_owner = null, lease_token = null, lease_acquired_at = null, lease_expires_at = null,
          last_error_code = 'LEASE_EXPIRED', last_error_summary = 'Worker lease expired before terminal evidence',
          updated_at = now()
      where j.job_id = v_job.job_id;
      update ingestion_private.ingestion_runs_v1 r
      set state = 'RETRY_SCHEDULED', finished_at = now(), error_code = 'LEASE_EXPIRED',
          error_summary = 'Worker lease expired before terminal evidence'
      where r.run_id = v_run_id;
      insert into ingestion_private.ingestion_run_events_v1(
        job_id, run_id, source_id, event_type, details_json
      ) values (
        v_job.job_id, v_run_id, v_job.source_id, 'RETRY_SCHEDULED',
        jsonb_build_object('retry_at', v_retry_at, 'reason', 'LEASE_EXPIRED')
      );
      v_retried := v_retried + 1;
    else
      update ingestion_private.ingestion_jobs_v1 j
      set state = 'DEAD_LETTERED',
          completed_at = now(),
          lease_owner = null, lease_token = null, lease_acquired_at = null, lease_expires_at = null,
          last_error_code = 'LEASE_EXPIRED', last_error_summary = 'Worker lease expired on final attempt',
          updated_at = now()
      where j.job_id = v_job.job_id;
      update ingestion_private.ingestion_runs_v1 r
      set state = 'DEAD_LETTERED', finished_at = now(), error_code = 'LEASE_EXPIRED',
          error_summary = 'Worker lease expired on final attempt'
      where r.run_id = v_run_id;
      insert into ingestion_private.ingestion_run_events_v1(
        job_id, run_id, source_id, event_type, details_json
      ) values (
        v_job.job_id, v_run_id, v_job.source_id, 'DEAD_LETTERED',
        jsonb_build_object('reason', 'LEASE_EXPIRED')
      );
      insert into ingestion_private.ingestion_dead_letters_v1(
        job_id, run_id, source_id, final_attempt_number, error_code, error_summary,
        payload_json, input_fingerprint
      ) values (
        v_job.job_id, v_run_id, v_job.source_id, v_job.attempt_count, 'LEASE_EXPIRED',
        'Worker lease expired on final attempt', v_job.payload_json, v_job.input_fingerprint
      ) on conflict (job_id) do nothing;
      v_dead := v_dead + 1;
    end if;
    v_recovered := v_recovered + 1;
  end loop;

  return query select v_recovered, v_retried, v_dead;
end;
$fn$;

revoke all on function public.enqueue_ingestion_job_v1(text,text,text,text,text,integer,timestamptz,text,text,jsonb,jsonb,timestamptz,timestamptz,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.claim_ingestion_job_v1(text,text,integer) from public, anon, authenticated;
revoke all on function public.start_ingestion_run_v1(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_ingestion_run_v1(uuid,uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_ingestion_run_v1(uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,jsonb,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.fail_ingestion_run_v1(uuid,uuid,text,uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.recover_expired_ingestion_leases_v1(integer) from public, anon, authenticated;

grant execute on function public.enqueue_ingestion_job_v1(text,text,text,text,text,integer,timestamptz,text,text,jsonb,jsonb,timestamptz,timestamptz,integer,integer,integer) to service_role;
grant execute on function public.claim_ingestion_job_v1(text,text,integer) to service_role;
grant execute on function public.start_ingestion_run_v1(uuid,uuid,text,uuid) to service_role;
grant execute on function public.heartbeat_ingestion_run_v1(uuid,uuid,text,uuid,integer) to service_role;
grant execute on function public.complete_ingestion_run_v1(uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,jsonb,text,text,jsonb) to service_role;
grant execute on function public.fail_ingestion_run_v1(uuid,uuid,text,uuid,text,text,jsonb) to service_role;
grant execute on function public.recover_expired_ingestion_leases_v1(integer) to service_role;

commit;

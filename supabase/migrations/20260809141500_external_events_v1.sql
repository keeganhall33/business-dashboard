-- External Events V1
-- Purpose: persist durable real-world event occurrences derived from Claims.
-- Scope: partnership_formed + entity_appointed_to_role only.
-- Constraints: additive, forward-only; no Claim/Evidence table modifications.

-- =========================================================
-- 0) Dependencies
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    create function set_updated_at()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end
$$;

-- =========================================================
-- 1) Stable event rows
-- =========================================================

create table if not exists public.external_events_v1 (
  event_id text primary key,
  current_content_hash text not null,

  event_type text not null check (event_type in ('partnership_formed','entity_appointed_to_role')),
  lifecycle_status text,
  correction_status text not null default 'none' check (correction_status in ('none','corrected','retracted','superseded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Note: stable->version FK is added after version table exists.

drop trigger if exists trg_external_events_v1_updated_at on public.external_events_v1;
create trigger trg_external_events_v1_updated_at
before update on public.external_events_v1
for each row execute function set_updated_at();

create index if not exists external_events_v1__event_type_idx on public.external_events_v1(event_type);
create index if not exists external_events_v1__updated_at_idx on public.external_events_v1(updated_at);

-- =========================================================
-- 2) Immutable event versions
-- =========================================================

create table if not exists public.external_event_versions_v1 (
  event_id text not null references public.external_events_v1(event_id) on delete restrict,
  content_hash text not null,
  schema_version text not null,

  event_fingerprint text not null,
  policy_version text not null,

  event_type text not null check (event_type in ('partnership_formed','entity_appointed_to_role')),

  payload_json jsonb,
  payload_available boolean not null default true,

  -- Optional time fields for queryability (do not rely on them for identity).
  announcement_time timestamptz,
  event_time timestamptz,
  effective_from timestamptz,
  effective_until timestamptz,

  verification_state text,

  created_at timestamptz not null default now(),

  primary key (event_id, content_hash),
  unique (event_id, content_hash),
  constraint external_event_versions_v1__payload_consistency_check
    check (
      (payload_available = true and payload_json is not null)
      or
      (payload_available = false and payload_json is null)
    )
);

alter table public.external_events_v1
  drop constraint if exists external_events_v1__current_version_fk;
alter table public.external_events_v1
  add constraint external_events_v1__current_version_fk
  foreign key (event_id, current_content_hash)
  references public.external_event_versions_v1(event_id, content_hash)
  on delete restrict
  deferrable initially deferred;

create index if not exists external_event_versions_v1__content_hash_idx on public.external_event_versions_v1(content_hash);
create index if not exists external_event_versions_v1__fingerprint_idx on public.external_event_versions_v1(event_fingerprint);
create index if not exists external_event_versions_v1__event_type_idx on public.external_event_versions_v1(event_type);
create index if not exists external_event_versions_v1__created_at_idx on public.external_event_versions_v1(created_at);

-- =========================================================
-- 3) Claim-version support links (Event VERSION -> Claim VERSION)
-- =========================================================

create table if not exists public.external_event_claim_links_v1 (
  link_id text primary key,

  event_id text not null,
  event_content_hash text not null,

  claim_id text not null,
  claim_content_hash text not null,

  created_at timestamptz not null default now(),

  constraint external_event_claim_links_v1__event_fk
    foreign key (event_id, event_content_hash)
    references public.external_event_versions_v1(event_id, content_hash)
    on delete restrict,

  constraint external_event_claim_links_v1__claim_fk
    foreign key (claim_id, claim_content_hash)
    references public.external_claim_versions_v1(claim_id, content_hash)
    on delete restrict,

  constraint external_event_claim_links_v1__uniq
    unique (event_id, event_content_hash, claim_id, claim_content_hash)
);

create index if not exists external_event_claim_links_v1__event_idx
  on public.external_event_claim_links_v1(event_id, event_content_hash);
create index if not exists external_event_claim_links_v1__claim_idx
  on public.external_event_claim_links_v1(claim_id, claim_content_hash);

-- =========================================================
-- 4) RPC: atomic persistence
-- =========================================================

create or replace function public.persist_external_event_v1(
  in_event_id text,
  in_content_hash text,
  in_schema_version text,
  in_event_fingerprint text,
  in_policy_version text,
  in_event_type text,
  in_payload_json jsonb,
  in_payload_available boolean,
  in_announcement_time timestamptz,
  in_event_time timestamptz,
  in_effective_from timestamptz,
  in_effective_until timestamptz,
  in_verification_state text,
  in_lifecycle_status text,
  in_correction_status text,
  in_claim_id text,
  in_claim_content_hash text,
  in_link_id text
)
returns table(
  event_id text,
  content_hash text,
  created_new_event boolean,
  created_new_version boolean,
  idempotent_replay boolean,
  support_link_created boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  existing_version record;
  inserted_event boolean := false;
  inserted_event_count integer := 0;
  inserted_version boolean := false;
  inserted_link boolean := false;
  inserted_link_count integer := 0;
  replay boolean := false;
begin
  -- Validate linked claim version exists.
  perform 1 from public.external_claim_versions_v1 cv
  where cv.claim_id = in_claim_id and cv.content_hash = in_claim_content_hash;
  if not found then
    raise exception using errcode = 'P0001', message = 'linked_version_not_found';
  end if;

  if in_event_type not in ('partnership_formed','entity_appointed_to_role') then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;

  -- Ensure stable row exists (or create).
  insert into public.external_events_v1(
    event_id,
    current_content_hash,
    event_type,
    lifecycle_status,
    correction_status
  )
  values(
    in_event_id,
    in_content_hash,
    in_event_type,
    in_lifecycle_status,
    coalesce(in_correction_status, 'none')
  )
  on conflict (event_id) do nothing;

  get diagnostics inserted_event_count = row_count;
  inserted_event := inserted_event_count > 0;

  -- Fetch existing version row by identity.
  select * into existing_version
  from public.external_event_versions_v1 ev
  where ev.event_id = in_event_id and ev.content_hash = in_content_hash;

  if found then
    -- Exact replay: enforce strict equality.
    if not (
      existing_version.schema_version is not distinct from in_schema_version
      and existing_version.event_fingerprint is not distinct from in_event_fingerprint
      and existing_version.policy_version is not distinct from in_policy_version
      and existing_version.event_type is not distinct from in_event_type
      and existing_version.payload_available is not distinct from in_payload_available
      and existing_version.payload_json is not distinct from in_payload_json
      and existing_version.announcement_time is not distinct from in_announcement_time
      and existing_version.event_time is not distinct from in_event_time
      and existing_version.effective_from is not distinct from in_effective_from
      and existing_version.effective_until is not distinct from in_effective_until
      and existing_version.verification_state is not distinct from in_verification_state
    ) then
      raise exception using errcode = 'P0001', message = 'integrity_conflict';
    end if;
    replay := true;
  else
    insert into public.external_event_versions_v1(
      event_id,
      content_hash,
      schema_version,
      event_fingerprint,
      policy_version,
      event_type,
      payload_json,
      payload_available,
      announcement_time,
      event_time,
      effective_from,
      effective_until,
      verification_state
    )
    values(
      in_event_id,
      in_content_hash,
      in_schema_version,
      in_event_fingerprint,
      in_policy_version,
      in_event_type,
      in_payload_json,
      in_payload_available,
      in_announcement_time,
      in_event_time,
      in_effective_from,
      in_effective_until,
      in_verification_state
    );
    inserted_version := true;
  end if;

  -- Pin stable to current version (always update to the persisted/confirmed content hash).
  update public.external_events_v1
    set
      current_content_hash = in_content_hash,
      event_type = in_event_type,
      lifecycle_status = in_lifecycle_status,
      correction_status = coalesce(in_correction_status, 'none'),
      updated_at = now()
    where event_id = in_event_id;

  -- Support link is idempotent.
  insert into public.external_event_claim_links_v1(
    link_id,
    event_id,
    event_content_hash,
    claim_id,
    claim_content_hash
  )
  values(
    in_link_id,
    in_event_id,
    in_content_hash,
    in_claim_id,
    in_claim_content_hash
  )
  on conflict (event_id, event_content_hash, claim_id, claim_content_hash) do nothing;

  get diagnostics inserted_link_count = row_count;
  inserted_link := inserted_link_count > 0;

  return query
    select in_event_id, in_content_hash, inserted_event, inserted_version, replay, inserted_link;
end;
$fn$;

revoke all on function public.persist_external_event_v1(
  text,text,text,text,text,text,jsonb,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text
) from public;
revoke all on function public.persist_external_event_v1(
  text,text,text,text,text,text,jsonb,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text
) from anon, authenticated;
grant execute on function public.persist_external_event_v1(
  text,text,text,text,text,text,jsonb,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text
) to service_role;

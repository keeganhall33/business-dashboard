-- Fix persist_external_event_v1: avoid PL/pgSQL name ambiguity

-- Drop first to preserve the original return type.
drop function if exists public.persist_external_event_v1(
  text,text,text,text,text,text,jsonb,boolean,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,text,text
);

create function public.persist_external_event_v1(
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
  perform 1 from public.external_claim_versions_v1 cv
  where cv.claim_id = in_claim_id and cv.content_hash = in_claim_content_hash;
  if not found then
    raise exception using errcode = 'P0001', message = 'linked_version_not_found';
  end if;

  if in_event_type not in ('partnership_formed','entity_appointed_to_role') then
    raise exception using errcode = 'P0001', message = 'invalid_argument';
  end if;

  insert into public.external_events_v1 as e(
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

  select * into existing_version
  from public.external_event_versions_v1 ev
  where ev.event_id = in_event_id and ev.content_hash = in_content_hash;

  if found then
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

  update public.external_events_v1 e
    set
      current_content_hash = in_content_hash,
      event_type = in_event_type,
      lifecycle_status = in_lifecycle_status,
      correction_status = coalesce(in_correction_status, 'none'),
      updated_at = now()
    where e.event_id = in_event_id;

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

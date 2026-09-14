begin;

create table if not exists public.crm_manual_capture_requests_v1 (
  idempotency_key text primary key,
  request_hash text not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_crm_manual_capture_requests_v1_updated_at
  on public.crm_manual_capture_requests_v1;
create trigger trg_crm_manual_capture_requests_v1_updated_at
before update on public.crm_manual_capture_requests_v1
for each row execute function public.set_updated_at();

alter table public.crm_manual_capture_requests_v1 enable row level security;
revoke all on table public.crm_manual_capture_requests_v1 from anon, authenticated;

create or replace function public.capture_crm_manual_activity_v1(
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  existing_hash text;
  existing_response jsonb;
  response_value jsonb;
  contact_id text := nullif(trim(p_payload->>'contactEntityId'), '');
  opportunity_id uuid := nullif(trim(p_payload->>'opportunityId'), '')::uuid;
  thread_id text := nullif(trim(p_payload->>'threadId'), '');
  activity_id text := nullif(trim(p_payload->>'activityId'), '');
  follow_up_id text := nullif(trim(p_payload->>'followUpId'), '');
  follow_up_due_at timestamptz := nullif(trim(p_payload->>'followUpDueAt'), '')::timestamptz;
begin
  if nullif(trim(p_idempotency_key), '') is null or nullif(trim(p_request_hash), '') is null then
    raise exception 'CRM_INVALID_IDEMPOTENCY';
  end if;

  select request_hash, response_json
    into existing_hash, existing_response
  from public.crm_manual_capture_requests_v1
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_hash <> p_request_hash then
      raise exception 'CRM_IDEMPOTENCY_CONFLICT';
    end if;
    return existing_response;
  end if;

  if contact_id is null or activity_id is null then
    raise exception 'CRM_INVALID_PAYLOAD';
  end if;
  if not exists (
    select 1 from public.entities_v1
    where entity_id = contact_id and entity_type = 'person' and resolution_status = 'active'
  ) then
    raise exception 'CRM_CONTACT_NOT_FOUND';
  end if;
  if opportunity_id is not null and not exists (
    select 1 from public.opportunity_pipeline where id = opportunity_id
  ) then
    raise exception 'CRM_OPPORTUNITY_NOT_FOUND';
  end if;

  insert into public.crm_manual_capture_requests_v1 (
    idempotency_key, request_hash, response_json
  ) values (
    p_idempotency_key, p_request_hash, null
  );

  insert into public.crm_activities_v1 (
    activity_id, contact_entity_id, opportunity_id, thread_id, source_type,
    activity_type, direction, summary, occurred_at, truth_state, freshness_state,
    evidence_refs, idempotency_key, metadata_json
  ) values (
    activity_id,
    contact_id,
    opportunity_id,
    thread_id,
    'MANUAL',
    p_payload->>'activityType',
    p_payload->>'direction',
    p_payload->>'summary',
    (p_payload->>'occurredAt')::timestamptz,
    'KNOWN',
    'CURRENT',
    array(select jsonb_array_elements_text(p_payload->'evidenceRefs')),
    p_idempotency_key || ':activity',
    jsonb_build_object('capturedBy', 'authenticated_dashboard_api', 'requestHash', p_request_hash)
  );

  if follow_up_due_at is not null then
    if thread_id is null and opportunity_id is null then
      raise exception 'CRM_FOLLOW_UP_SCOPE_REQUIRED';
    end if;
    insert into public.crm_follow_ups_v1 (
      follow_up_id, contact_entity_id, opportunity_id, thread_id, due_at, status,
      truth_state, freshness_state, evidence_refs, observed_at, idempotency_key
    ) values (
      follow_up_id,
      contact_id,
      opportunity_id,
      thread_id,
      follow_up_due_at,
      'OPEN',
      'KNOWN',
      'CURRENT',
      array(select jsonb_array_elements_text(p_payload->'evidenceRefs')),
      now(),
      p_idempotency_key || ':follow-up'
    );
  end if;

  response_value := jsonb_build_object(
    'ok', true,
    'activityId', activity_id,
    'followUpId', case when follow_up_due_at is null then null else follow_up_id end,
    'replayed', false
  );
  update public.crm_manual_capture_requests_v1
  set response_json = response_value
  where idempotency_key = p_idempotency_key;
  return response_value;
end;
$function$;

revoke all on function public.capture_crm_manual_activity_v1(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.capture_crm_manual_activity_v1(text, text, jsonb)
  to service_role;

comment on function public.capture_crm_manual_activity_v1(text, text, jsonb) is
  'Atomic service-role-only manual CRM capture. It records activity/follow-up facts and never sends messages.';

commit;

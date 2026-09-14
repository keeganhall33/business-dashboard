begin;

create table if not exists public.crm_relationship_states_v1 (
  relationship_state_id text primary key,
  contact_entity_id text not null references public.entities_v1(entity_id) on delete restrict,
  thread_id text not null,
  primary_state text not null check (primary_state in (
    'NEEDS_REPLY','WAITING_ON_CONTACT','RESOLVED','NO_ACTION','UNKNOWN','CONFLICTED'
  )),
  states text[] not null check (cardinality(states) between 1 and 12),
  opportunity_ids uuid[] not null default array[]::uuid[],
  mailbox_roles text[] not null default array[]::text[],
  last_meaningful_interaction_json jsonb,
  truth_state text not null check (truth_state in ('KNOWN','UNKNOWN','CONFLICTED')),
  freshness_state text not null check (freshness_state in ('CURRENT','STALE','UNKNOWN')),
  decision_eligible boolean not null default false,
  next_best_move_json jsonb not null,
  prior_state_json jsonb,
  evidence_refs text[] not null check (cardinality(evidence_refs) between 1 and 100),
  evidence_fingerprint text not null,
  observed_at timestamptz not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_entity_id, thread_id),
  unique (evidence_fingerprint)
);

create table if not exists public.crm_activities_v1 (
  activity_id text primary key,
  contact_entity_id text not null references public.entities_v1(entity_id) on delete restrict,
  opportunity_id uuid references public.opportunity_pipeline(id) on delete set null,
  thread_id text,
  source_type text not null check (source_type in ('MANUAL','IONOS')),
  activity_type text not null check (activity_type in ('EMAIL','CALL','MEETING','NOTE','GIFT','OTHER')),
  direction text not null check (direction in ('INBOUND','OUTBOUND','SELF')),
  summary text not null check (char_length(trim(summary)) between 1 and 2000),
  occurred_at timestamptz not null,
  truth_state text not null check (truth_state in ('KNOWN','UNKNOWN','CONFLICTED')),
  freshness_state text not null check (freshness_state in ('CURRENT','STALE','UNKNOWN')),
  evidence_refs text[] not null check (cardinality(evidence_refs) between 1 and 100),
  idempotency_key text not null unique,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_follow_ups_v1 (
  follow_up_id text primary key,
  contact_entity_id text not null references public.entities_v1(entity_id) on delete restrict,
  opportunity_id uuid references public.opportunity_pipeline(id) on delete set null,
  thread_id text,
  due_at timestamptz,
  status text not null check (status in ('OPEN','COMPLETED','CANCELLED')),
  truth_state text not null check (truth_state in ('KNOWN','UNKNOWN','CONFLICTED')),
  freshness_state text not null check (freshness_state in ('CURRENT','STALE','UNKNOWN')),
  evidence_refs text[] not null check (cardinality(evidence_refs) between 1 and 100),
  observed_at timestamptz not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (thread_id is not null or opportunity_id is not null)
);

create table if not exists public.crm_opportunity_entities_v1 (
  opportunity_id uuid not null references public.opportunity_pipeline(id) on delete cascade,
  entity_id text not null references public.entities_v1(entity_id) on delete restrict,
  role text not null check (role in ('CONTACT','ORGANIZATION','BRAND','AGENCY','REFERRER','OTHER')),
  truth_state text not null check (truth_state in ('KNOWN','UNKNOWN','CONFLICTED')),
  freshness_state text not null check (freshness_state in ('CURRENT','STALE','UNKNOWN')),
  evidence_refs text[] not null check (cardinality(evidence_refs) between 1 and 100),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opportunity_id, entity_id, role)
);

create index if not exists crm_relationship_states_v1_contact_idx
  on public.crm_relationship_states_v1(contact_entity_id, generated_at desc);
create index if not exists crm_relationship_states_v1_state_idx
  on public.crm_relationship_states_v1(primary_state, updated_at desc);
create index if not exists crm_activities_v1_contact_idx
  on public.crm_activities_v1(contact_entity_id, occurred_at desc);
create index if not exists crm_activities_v1_opportunity_idx
  on public.crm_activities_v1(opportunity_id, occurred_at desc);
create index if not exists crm_follow_ups_v1_due_idx
  on public.crm_follow_ups_v1(status, due_at);
create index if not exists crm_follow_ups_v1_contact_idx
  on public.crm_follow_ups_v1(contact_entity_id, updated_at desc);
create index if not exists crm_follow_ups_v1_opportunity_idx
  on public.crm_follow_ups_v1(opportunity_id)
  where opportunity_id is not null;
create index if not exists crm_opportunity_entities_v1_entity_idx
  on public.crm_opportunity_entities_v1(entity_id, opportunity_id);

drop trigger if exists trg_crm_relationship_states_v1_updated_at on public.crm_relationship_states_v1;
create trigger trg_crm_relationship_states_v1_updated_at
before update on public.crm_relationship_states_v1
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_activities_v1_updated_at on public.crm_activities_v1;
create trigger trg_crm_activities_v1_updated_at
before update on public.crm_activities_v1
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_follow_ups_v1_updated_at on public.crm_follow_ups_v1;
create trigger trg_crm_follow_ups_v1_updated_at
before update on public.crm_follow_ups_v1
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_opportunity_entities_v1_updated_at on public.crm_opportunity_entities_v1;
create trigger trg_crm_opportunity_entities_v1_updated_at
before update on public.crm_opportunity_entities_v1
for each row execute function public.set_updated_at();

alter table public.crm_relationship_states_v1 enable row level security;
alter table public.crm_activities_v1 enable row level security;
alter table public.crm_follow_ups_v1 enable row level security;
alter table public.crm_opportunity_entities_v1 enable row level security;

revoke all on table public.crm_relationship_states_v1 from anon, authenticated;
revoke all on table public.crm_activities_v1 from anon, authenticated;
revoke all on table public.crm_follow_ups_v1 from anon, authenticated;
revoke all on table public.crm_opportunity_entities_v1 from anon, authenticated;

comment on table public.crm_relationship_states_v1 is
  'Current evidence-backed relationship projection for server-only CRM workflows.';
comment on table public.crm_activities_v1 is
  'Audited manual or read-only IONOS relationship touchpoints; never a send surface.';
comment on table public.crm_follow_ups_v1 is
  'Evidence-backed CRM follow-ups used by the canonical follow-up queue.';
comment on table public.crm_opportunity_entities_v1 is
  'Evidence-backed canonical entity links for existing opportunity_pipeline records.';

-- Keegan-confirmed acceptance scenario. This is an idempotent backfill of known facts,
-- not a claim that Mercedes-Benz replied, approved, budgeted, or committed.
insert into public.entities_v1 (entity_id, entity_type, canonical_name, resolution_status)
values
  ('person:michelle-bevilacqua', 'person', 'Michelle Bevilacqua', 'active'),
  ('organization:public-school', 'organization', 'Public School', 'active'),
  ('organization:mercedes-benz', 'organization', 'Mercedes-Benz', 'active'),
  ('person:melody-lee', 'person', 'Melody Lee', 'active')
on conflict (entity_id) do update set
  entity_type = excluded.entity_type,
  canonical_name = excluded.canonical_name,
  resolution_status = excluded.resolution_status;

insert into public.opportunity_pipeline (
  name, organization, opportunity_type, status, value_estimate, prestige_score,
  probability_score, owner_agent, contact_name, contact_role, next_step,
  next_step_due_at, notes_md, source, natural_key
)
values (
  'Mercedes-Benz Masters collaboration',
  'Mercedes-Benz',
  'brand_partnership',
  'in_conversation',
  null,
  null,
  null,
  'keegan',
  'Michelle Bevilacqua',
  'Public School',
  'Wait for contact; review the relationship on September 22, 2026.',
  '2026-09-22T16:00:00Z'::timestamptz,
  'Keegan-confirmed context: Mercedes-Benz Masters collaboration, with Michelle Bevilacqua / Public School and Melody Lee / Mercedes-Benz. Proposal concepts are Keegan proposal context only. No reply, meeting, budget, approval, or commitment is asserted.',
  'KEEGAN_CONFIRMED',
  'crm:mercedes-benz-masters-collaboration'
)
on conflict (natural_key) do update set
  name = excluded.name,
  organization = excluded.organization,
  opportunity_type = excluded.opportunity_type,
  status = excluded.status,
  value_estimate = excluded.value_estimate,
  prestige_score = excluded.prestige_score,
  probability_score = excluded.probability_score,
  owner_agent = excluded.owner_agent,
  contact_name = excluded.contact_name,
  contact_role = excluded.contact_role,
  next_step = excluded.next_step,
  next_step_due_at = excluded.next_step_due_at,
  notes_md = excluded.notes_md,
  source = excluded.source;

with opportunity as (
  select id from public.opportunity_pipeline
  where natural_key = 'crm:mercedes-benz-masters-collaboration'
)
insert into public.crm_activities_v1 (
  activity_id, contact_entity_id, opportunity_id, thread_id, source_type,
  activity_type, direction, summary, occurred_at, truth_state, freshness_state,
  evidence_refs, idempotency_key, metadata_json
)
select
  'activity:mercedes-masters:2026-09-11:outbound-follow-up',
  'person:michelle-bevilacqua',
  opportunity.id,
  'manual:mercedes-masters',
  'MANUAL',
  'EMAIL',
  'OUTBOUND',
  'Keegan confirmed an outbound follow-up on September 11, 2026.',
  '2026-09-11T16:00:00Z'::timestamptz,
  'KNOWN',
  'CURRENT',
  array['user:crm-update:2026-09-11:mercedes-masters'],
  'manual:mercedes-masters:2026-09-11:outbound-follow-up',
  jsonb_build_object('asserted_absences', jsonb_build_array('reply', 'meeting', 'budget', 'approval', 'commitment'))
from opportunity
on conflict (idempotency_key) do update set
  summary = excluded.summary,
  occurred_at = excluded.occurred_at,
  truth_state = excluded.truth_state,
  freshness_state = excluded.freshness_state,
  evidence_refs = excluded.evidence_refs,
  metadata_json = excluded.metadata_json;

with opportunity as (
  select id from public.opportunity_pipeline
  where natural_key = 'crm:mercedes-benz-masters-collaboration'
)
insert into public.crm_relationship_states_v1 (
  relationship_state_id, contact_entity_id, thread_id, primary_state, states,
  opportunity_ids, mailbox_roles, last_meaningful_interaction_json, truth_state,
  freshness_state, decision_eligible, next_best_move_json, prior_state_json,
  evidence_refs, evidence_fingerprint, observed_at, generated_at
)
select
  'relationship:michelle-bevilacqua:mercedes-masters',
  'person:michelle-bevilacqua',
  'manual:mercedes-masters',
  'WAITING_ON_CONTACT',
  array['WAITING_ON_CONTACT', 'HIGH_VALUE'],
  array[opportunity.id],
  array['PERSONAL_HIGH_VALUE_RELATIONSHIP'],
  jsonb_build_object(
    'activityId', 'activity:mercedes-masters:2026-09-11:outbound-follow-up',
    'canonicalEmailId', 'manual:mercedes-masters:2026-09-11:outbound-follow-up',
    'effectiveTimestamp', '2026-09-11T16:00:00.000Z',
    'direction', 'OUTBOUND',
    'mailboxRole', 'PERSONAL_HIGH_VALUE_RELATIONSHIP',
    'expectsReply', true
  ),
  'KNOWN',
  'CURRENT',
  true,
  jsonb_build_object(
    'move', 'WAIT_FOR_CONTACT',
    'status', 'SUGGESTED_UNVERIFIED',
    'evidenceRefs', jsonb_build_array('user:crm-update:2026-09-11:mercedes-masters'),
    'blockingConditions', jsonb_build_array('No verified reply is recorded.'),
    'whatWouldChange', jsonb_build_array('A verified reply or the September 22 review date.')
  ),
  null,
  array['user:crm-update:2026-09-11:mercedes-masters'],
  'sha256:mercedes-masters:2026-09-11:waiting-on-contact',
  '2026-09-11T16:00:00Z'::timestamptz,
  '2026-09-14T16:00:00Z'::timestamptz
from opportunity
on conflict (relationship_state_id) do update set
  primary_state = excluded.primary_state,
  states = excluded.states,
  opportunity_ids = excluded.opportunity_ids,
  mailbox_roles = excluded.mailbox_roles,
  last_meaningful_interaction_json = excluded.last_meaningful_interaction_json,
  truth_state = excluded.truth_state,
  freshness_state = excluded.freshness_state,
  decision_eligible = excluded.decision_eligible,
  next_best_move_json = excluded.next_best_move_json,
  prior_state_json = excluded.prior_state_json,
  evidence_refs = excluded.evidence_refs,
  evidence_fingerprint = excluded.evidence_fingerprint,
  observed_at = excluded.observed_at,
  generated_at = excluded.generated_at;

with opportunity as (
  select id from public.opportunity_pipeline
  where natural_key = 'crm:mercedes-benz-masters-collaboration'
)
insert into public.crm_follow_ups_v1 (
  follow_up_id, contact_entity_id, opportunity_id, thread_id, due_at, status,
  truth_state, freshness_state, evidence_refs, observed_at, idempotency_key
)
select
  'follow-up:mercedes-masters:2026-09-22',
  'person:michelle-bevilacqua',
  opportunity.id,
  'manual:mercedes-masters',
  '2026-09-22T16:00:00Z'::timestamptz,
  'OPEN',
  'KNOWN',
  'CURRENT',
  array['user:crm-update:2026-09-11:mercedes-masters'],
  '2026-09-14T16:00:00Z'::timestamptz,
  'manual:mercedes-masters:follow-up:2026-09-22'
from opportunity
on conflict (idempotency_key) do update set
  due_at = excluded.due_at,
  status = excluded.status,
  truth_state = excluded.truth_state,
  freshness_state = excluded.freshness_state,
  evidence_refs = excluded.evidence_refs,
  observed_at = excluded.observed_at;

with opportunity as (
  select id from public.opportunity_pipeline
  where natural_key = 'crm:mercedes-benz-masters-collaboration'
), links(entity_id, role) as (
  values
    ('person:michelle-bevilacqua', 'CONTACT'),
    ('organization:public-school', 'AGENCY'),
    ('organization:mercedes-benz', 'BRAND'),
    ('person:melody-lee', 'CONTACT')
)
insert into public.crm_opportunity_entities_v1 (
  opportunity_id, entity_id, role, truth_state, freshness_state, evidence_refs, observed_at
)
select
  opportunity.id,
  links.entity_id,
  links.role,
  'KNOWN',
  'CURRENT',
  array['user:crm-update:2026-09-11:mercedes-masters'],
  '2026-09-14T16:00:00Z'::timestamptz
from opportunity cross join links
on conflict (opportunity_id, entity_id, role) do update set
  truth_state = excluded.truth_state,
  freshness_state = excluded.freshness_state,
  evidence_refs = excluded.evidence_refs,
  observed_at = excluded.observed_at;

commit;

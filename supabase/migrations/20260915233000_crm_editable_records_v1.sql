begin;

create table if not exists public.crm_entity_profiles_v1 (
  entity_id text primary key references public.entities_v1(entity_id) on delete cascade,
  title text,
  category text,
  primary_email text,
  phone text,
  linkedin_url text,
  website_url text,
  notes_md text,
  source text not null default 'DASHBOARD_MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_entity_profiles_v1_email_check
    check (primary_email is null or primary_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table if not exists public.crm_entity_links_v1 (
  link_id uuid primary key default gen_random_uuid(),
  subject_entity_id text not null references public.entities_v1(entity_id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'WORKS_AT','AGENCY_FOR','REPRESENTS','PARTNER_OF','AFFILIATED_WITH'
  )),
  object_entity_id text not null references public.entities_v1(entity_id) on delete cascade,
  role_title text,
  notes_md text,
  is_primary boolean not null default false,
  source text not null default 'DASHBOARD_MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_entity_links_v1_no_self_link check (subject_entity_id <> object_entity_id),
  unique (subject_entity_id, relationship_type, object_entity_id)
);

create index if not exists crm_entity_links_v1_subject_idx
  on public.crm_entity_links_v1(subject_entity_id, relationship_type);
create index if not exists crm_entity_links_v1_object_idx
  on public.crm_entity_links_v1(object_entity_id, relationship_type);
create unique index if not exists crm_entity_links_v1_primary_employer_idx
  on public.crm_entity_links_v1(subject_entity_id)
  where relationship_type = 'WORKS_AT' and is_primary;

drop trigger if exists trg_crm_entity_profiles_v1_updated_at on public.crm_entity_profiles_v1;
create trigger trg_crm_entity_profiles_v1_updated_at
before update on public.crm_entity_profiles_v1
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_entity_links_v1_updated_at on public.crm_entity_links_v1;
create trigger trg_crm_entity_links_v1_updated_at
before update on public.crm_entity_links_v1
for each row execute function public.set_updated_at();

alter table public.crm_entity_profiles_v1 enable row level security;
alter table public.crm_entity_links_v1 enable row level security;
revoke all on table public.crm_entity_profiles_v1 from anon, authenticated;
revoke all on table public.crm_entity_links_v1 from anon, authenticated;

comment on table public.crm_entity_profiles_v1 is
  'Dashboard-editable contact and organization profile fields for canonical CRM entities.';
comment on table public.crm_entity_links_v1 is
  'Dashboard-editable person, company, agency, brand, and partner relationships.';

insert into public.entities_v1 (entity_id, entity_type, canonical_name, resolution_status)
values
  ('person:andy-anschel', 'person', 'Andy Anschel', 'active'),
  ('organization:adidas', 'organization', 'Adidas', 'active'),
  ('organization:university-of-washington-football', 'organization', 'University of Washington Football', 'active')
on conflict (entity_id) do update set
  entity_type = excluded.entity_type,
  canonical_name = excluded.canonical_name,
  resolution_status = 'active';

update public.entities_v1
set resolution_status = 'retired'
where entity_type = 'organization'
  and regexp_replace(lower(canonical_name), '[^a-z0-9]+', ' ', 'g') in (
    'adidas university of washington football',
    'adidas uw football'
  );

insert into public.crm_entity_profiles_v1 (entity_id, category, source)
values
  ('organization:public-school', 'Creative agency', 'KEEGAN_CONFIRMED'),
  ('organization:mercedes-benz', 'Automotive brand', 'KEEGAN_CONFIRMED'),
  ('organization:adidas', 'Sportswear brand', 'KEEGAN_CONFIRMED'),
  ('organization:university-of-washington-football', 'College athletics program', 'KEEGAN_CONFIRMED')
on conflict (entity_id) do update set
  category = excluded.category,
  source = excluded.source;

insert into public.crm_entity_links_v1 (
  subject_entity_id, relationship_type, object_entity_id, is_primary, source
)
values
  ('person:andy-anschel', 'WORKS_AT', 'organization:public-school', true, 'KEEGAN_CONFIRMED'),
  ('person:michelle-bevilacqua', 'WORKS_AT', 'organization:public-school', true, 'KEEGAN_CONFIRMED'),
  ('person:melody-lee', 'WORKS_AT', 'organization:mercedes-benz', true, 'KEEGAN_CONFIRMED'),
  ('organization:public-school', 'AGENCY_FOR', 'organization:mercedes-benz', true, 'KEEGAN_CONFIRMED'),
  ('organization:adidas', 'PARTNER_OF', 'organization:university-of-washington-football', false, 'KEEGAN_CONFIRMED')
on conflict (subject_entity_id, relationship_type, object_entity_id) do update set
  is_primary = excluded.is_primary,
  source = excluded.source;

with corrected as (
  update public.opportunity_pipeline
  set organization = 'University of Washington Football'
  where regexp_replace(lower(coalesce(organization, '')), '[^a-z0-9]+', ' ', 'g') in (
    'adidas university of washington football',
    'adidas uw football'
  )
  returning id
)
insert into public.crm_opportunity_entities_v1 (
  opportunity_id, entity_id, role, truth_state, freshness_state, evidence_refs, observed_at
)
select corrected.id, link.entity_id, link.role, 'KNOWN', 'CURRENT',
  array['user:crm-correction:2026-09-15'], now()
from corrected
cross join (values
  ('organization:university-of-washington-football', 'ORGANIZATION'),
  ('organization:adidas', 'BRAND')
) as link(entity_id, role)
on conflict (opportunity_id, entity_id, role) do update set
  truth_state = excluded.truth_state,
  freshness_state = excluded.freshness_state,
  evidence_refs = excluded.evidence_refs,
  observed_at = excluded.observed_at;

commit;

begin;

alter table public.crm_entity_profiles_v1
  add column if not exists relationship_state text,
  add column if not exists relationship_quality text,
  add column if not exists last_touch_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists next_move text,
  add column if not exists supported_value numeric(14,2);

alter table public.crm_entity_profiles_v1
  drop constraint if exists crm_entity_profiles_v1_relationship_quality_check;
alter table public.crm_entity_profiles_v1
  add constraint crm_entity_profiles_v1_relationship_quality_check
  check (relationship_quality is null or relationship_quality in ('LOW', 'MEDIUM', 'HIGH'));

alter table public.crm_entity_profiles_v1
  drop constraint if exists crm_entity_profiles_v1_supported_value_check;
alter table public.crm_entity_profiles_v1
  add constraint crm_entity_profiles_v1_supported_value_check
  check (supported_value is null or supported_value >= 0);

insert into public.entities_v1 (entity_id, entity_type, canonical_name, resolution_status)
values ('person:andi-anchell', 'person', 'Andi Anchell', 'active')
on conflict (entity_id) do update set
  canonical_name = excluded.canonical_name,
  resolution_status = 'active';

delete from public.crm_entity_links_v1
where subject_entity_id in ('person:andi-anchell', 'person:andy-anschel')
  and relationship_type = 'WORKS_AT'
  and is_primary;

insert into public.crm_entity_links_v1 (
  subject_entity_id, relationship_type, object_entity_id, is_primary, source
)
values ('person:andi-anchell', 'WORKS_AT', 'organization:public-school', true, 'KEEGAN_CONFIRMED')
on conflict (subject_entity_id, relationship_type, object_entity_id) do update set
  is_primary = true,
  source = excluded.source;

update public.entities_v1
set resolution_status = 'retired'
where entity_id = 'person:andy-anschel';

commit;

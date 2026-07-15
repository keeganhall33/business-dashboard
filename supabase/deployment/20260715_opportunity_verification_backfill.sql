-- Mark specific opportunities with verified trust states per Phase 3E.1
\echo 'Backfilling opportunity verification statuses'

create or replace function public.__assert_single_match(opportunity_name text)
returns uuid
language plpgsql
as $$
declare
  match_id uuid;
  match_count int;
begin
  select id, count(*) over ()
  into match_id, match_count
  from public.opportunity_pipeline
  where lower(name) = lower(opportunity_name)
  limit 1;

  if match_count is null or match_count <> 1 then
    raise exception 'Expected exactly one opportunity named %, found %', opportunity_name, coalesce(match_count, 0);
  end if;

  return match_id;
end;
$$;

-- Formula One Legends -> invalid
with target as (
  select public.__assert_single_match('Formula One Legends') as id
)
update public.opportunity_pipeline
set
  verification_status = 'invalid',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Invalid record removed from executive pipeline.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Red Bull Racing -> invalid
with target as (
  select public.__assert_single_match('Red Bull Racing') as id
)
update public.opportunity_pipeline
set
  verification_status = 'invalid',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Invalid record removed from executive pipeline.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- TAG Heuer Heritage -> invalid
with target as (
  select public.__assert_single_match('TAG Heuer Heritage') as id
)
update public.opportunity_pipeline
set
  verification_status = 'invalid',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Invalid record removed from executive pipeline.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Topps sports collectible collaboration -> verified_on_hold
with target as (
  select public.__assert_single_match('Topps sports collectible collaboration') as id
)
update public.opportunity_pipeline
set
  verification_status = 'verified_on_hold',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Opportunity on hold pending refreshed scope.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Upper Deck Hall of Fame capsule -> verified_on_hold
with target as (
  select public.__assert_single_match('Upper Deck Hall of Fame capsule') as id
)
update public.opportunity_pipeline
set
  verification_status = 'verified_on_hold',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'On hold awaiting updated brief.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Upper Deck Legends -> verified_on_hold
with target as (
  select public.__assert_single_match('Upper Deck Legends') as id
)
update public.opportunity_pipeline
set
  verification_status = 'verified_on_hold',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'On hold awaiting updated brief.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Seahawks 50th -> verified_complete
with target as (
  select public.__assert_single_match('Seahawks 50th') as id
)
update public.opportunity_pipeline
set
  verification_status = 'verified_complete',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Completed/expired opportunity retained for history only.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall',
  value_basis = null,
  confidence = null
where id in (select id from target);

-- Kraken / CPA -> verified_active
with target as (
  select public.__assert_single_match('Kraken / CPA') as id
)
update public.opportunity_pipeline
set
  verification_status = 'verified_active',
  verification_source = 'direct_user_confirmation',
  verification_notes = 'Active campaign with verified CPA partnership.',
  last_verified_at = timezone('UTC', now()),
  last_verified_by = 'Keegan Hall'
where id in (select id from target);

drop function if exists public.__assert_single_match;

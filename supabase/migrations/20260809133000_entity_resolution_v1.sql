-- Entity Resolution V1 (Phase ER1)
-- Adds canonical entity storage + alias/link/relationship overlay.
-- Historical Claim/Evidence payloads remain immutable.

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
-- 1) Canonical entities
-- =========================================================

create table if not exists entities_v1 (
  entity_id text primary key,
  entity_type text not null check (entity_type in ('organization','person')),
  canonical_name text not null,

  -- Resolution lifecycle for the canonical entity record itself.
  -- Note: this is NOT the resolution status of a provisional EntityRef.
  resolution_status text not null default 'active' check (resolution_status in ('active','retired','merged','superseded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_entities_v1_updated_at on entities_v1;
create trigger trg_entities_v1_updated_at
before update on entities_v1
for each row execute function set_updated_at();

create index if not exists entities_v1__entity_type_idx on entities_v1(entity_type);
create index if not exists entities_v1__canonical_name_idx on entities_v1(canonical_name);

-- =========================================================
-- 2) Aliases
-- =========================================================

create table if not exists entity_aliases_v1 (
  alias_id text primary key,
  canonical_entity_id text not null references entities_v1(entity_id) on delete restrict,

  alias text not null,
  alias_type text not null check (alias_type in (
    'canonical_variant',
    'acronym',
    'legal_name',
    'common_name',
    'brand_name',
    'manual'
  )),

  confidence_json jsonb not null default '{}'::jsonb,
  provenance_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz
);

drop trigger if exists trg_entity_aliases_v1_updated_at on entity_aliases_v1;
create trigger trg_entity_aliases_v1_updated_at
before update on entity_aliases_v1
for each row execute function set_updated_at();

-- Duplicate-safe: prevent identical alias rows for the same canonical entity + alias_type.
create unique index if not exists entity_aliases_v1__entity_alias_type_uniq
  on entity_aliases_v1(canonical_entity_id, alias, alias_type);

create index if not exists entity_aliases_v1__alias_idx on entity_aliases_v1(alias);
create index if not exists entity_aliases_v1__canonical_entity_id_idx on entity_aliases_v1(canonical_entity_id);

-- =========================================================
-- 3) Provisional -> canonical resolution links (overlay)
-- =========================================================

create table if not exists entity_resolution_links_v1 (
  link_id text primary key,

  provisional_entity_id text not null,
  canonical_entity_id text not null references entities_v1(entity_id) on delete restrict,

  status text not null check (status in ('resolved','suggested','rejected','ambiguous')),
  confidence_json jsonb not null default '{}'::jsonb,
  resolution_method text not null,
  provenance_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_entity_resolution_links_v1_updated_at on entity_resolution_links_v1;
create trigger trg_entity_resolution_links_v1_updated_at
before update on entity_resolution_links_v1
for each row execute function set_updated_at();

create index if not exists entity_resolution_links_v1__provisional_idx
  on entity_resolution_links_v1(provisional_entity_id);
create index if not exists entity_resolution_links_v1__canonical_idx
  on entity_resolution_links_v1(canonical_entity_id);
create index if not exists entity_resolution_links_v1__status_idx
  on entity_resolution_links_v1(status);

-- At most one RESOLVED canonical mapping per provisional id.
create unique index if not exists entity_resolution_links_v1__one_resolved_per_provisional
  on entity_resolution_links_v1(provisional_entity_id)
  where status = 'resolved';

-- =========================================================
-- 4) Minimal relationship edges (NOT merges)
-- =========================================================

create table if not exists entity_relationships_v1 (
  relationship_id text primary key,

  subject_entity_id text not null references entities_v1(entity_id) on delete restrict,
  relationship_type text not null check (relationship_type in (
    'parent_of',
    'subsidiary_of',
    'brand_of',
    'division_of',
    'acquired_by'
  )),
  object_entity_id text not null references entities_v1(entity_id) on delete restrict,

  valid_from timestamptz,
  valid_until timestamptz,

  confidence_json jsonb not null default '{}'::jsonb,
  provenance_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entity_relationships_v1__no_self_edge_check
    check (subject_entity_id <> object_entity_id),

  constraint entity_relationships_v1__valid_range_check
    check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

drop trigger if exists trg_entity_relationships_v1_updated_at on entity_relationships_v1;
create trigger trg_entity_relationships_v1_updated_at
before update on entity_relationships_v1
for each row execute function set_updated_at();

create index if not exists entity_relationships_v1__subject_idx on entity_relationships_v1(subject_entity_id);
create index if not exists entity_relationships_v1__object_idx on entity_relationships_v1(object_entity_id);
create index if not exists entity_relationships_v1__type_idx on entity_relationships_v1(relationship_type);

-- Duplicate-safe: prevent identical edges with identical validity window.
create unique index if not exists entity_relationships_v1__dedup_uniq
  on entity_relationships_v1(subject_entity_id, relationship_type, object_entity_id, coalesce(valid_from, '-infinity'::timestamptz), coalesce(valid_until, 'infinity'::timestamptz));

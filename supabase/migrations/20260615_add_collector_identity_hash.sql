alter table if exists public.collector_relationships
  add column if not exists identity_hash text;

create unique index if not exists idx_collector_identity_hash_unique
  on public.collector_relationships(identity_hash)
  where identity_hash is not null;

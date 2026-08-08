alter table if exists public.collector_relationships
  add column if not exists last_touch_at timestamptz,
  add column if not exists next_touch_due_at timestamptz,
  add column if not exists source text,
  add column if not exists updated_by text,
  add column if not exists import_batch_id uuid;

create index if not exists idx_collector_relationships_last_touch
  on public.collector_relationships(last_touch_at desc);

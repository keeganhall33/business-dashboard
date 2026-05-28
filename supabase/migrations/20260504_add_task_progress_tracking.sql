-- Adds real progress tracking + daily update enforcement primitives.

alter table if exists task_queue
  add column if not exists progress_percent numeric,
  add column if not exists progress_note text,
  add column if not exists last_progress_at timestamptz,
  add column if not exists progress_updated_by text;
-- Backfill sane defaults.
update task_queue
  set progress_percent = coalesce(progress_percent, case when status = 'completed' then 100 else 0 end);
update task_queue
  set last_progress_at = coalesce(last_progress_at, started_at, updated_at, created_at);
-- Clamp to bounds and make it cheap to query.
do $$
begin
  alter table if exists task_queue
    add constraint task_queue_progress_percent_bounds
    check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100));
exception
  when duplicate_object then null;
end $$;
create index if not exists idx_task_queue_last_progress_at
  on task_queue(last_progress_at desc);
-- Immutable progress log (audit + dashboard "real progress" feed)
create table if not exists task_progress_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references task_queue(id) on delete cascade,
  progress_percent numeric,
  note text,
  deliverable_links jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);
do $$
begin
  alter table if exists task_progress_updates
    add constraint task_progress_updates_progress_percent_bounds
    check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100));
exception
  when duplicate_object then null;
end $$;
create index if not exists idx_task_progress_updates_task_id_created_at
  on task_progress_updates(task_id, created_at desc);

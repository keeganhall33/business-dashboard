alter table if exists task_queue
  add column if not exists deliverable_links jsonb not null default '[]'::jsonb;

update task_queue
  set deliverable_links = coalesce(deliverable_links, '[]'::jsonb);

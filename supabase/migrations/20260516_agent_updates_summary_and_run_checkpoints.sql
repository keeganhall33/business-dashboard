-- 20260516_agent_updates_summary_and_run_checkpoints.sql
-- Fix agent_updates update_type constraint to allow "summary" (used by automation + status snapshots)
-- Add system_run_checkpoints table for handshake/resume/progress visibility.

begin;

-- 1) agent_updates.update_type: include 'summary'
-- Existing check constraint name may vary; drop by name if present.
alter table agent_updates drop constraint if exists agent_updates_update_type_check;

alter table agent_updates
  add constraint agent_updates_update_type_check
  check (update_type in ('insight','action','big_bet','directive','health','note','summary'));

-- 2) system_run_checkpoints
create table if not exists system_run_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references system_runs(id) on delete cascade,
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  checkpoint_key text not null,
  status text not null check (status in ('started','completed','failed')),
  detail_md text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_run_checkpoints_run_id_created_at
  on system_run_checkpoints(run_id, created_at asc);
create index if not exists idx_system_run_checkpoints_agent_key_created_at
  on system_run_checkpoints(agent_key, created_at desc);
create unique index if not exists idx_system_run_checkpoints_unique
  on system_run_checkpoints(run_id, checkpoint_key);

drop trigger if exists trg_system_run_checkpoints_updated_at on system_run_checkpoints;
create trigger trg_system_run_checkpoints_updated_at
before update on system_run_checkpoints
for each row execute function set_updated_at();

commit;

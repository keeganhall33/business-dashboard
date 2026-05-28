-- Add KPI tracking tables
create table if not exists agent_kpis (
  kpi_key text primary key,
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  kpi_name text not null,
  description text,
  target_value numeric,
  unit text,
  frequency text,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_agent_kpis_updated_at on agent_kpis;
create trigger trg_agent_kpis_updated_at
before update on agent_kpis
for each row execute function set_updated_at();
create table if not exists agent_kpi_readings (
  id uuid primary key default gen_random_uuid(),
  kpi_key text not null references agent_kpis(kpi_key) on delete cascade,
  value numeric,
  measured_at timestamptz not null default now(),
  source text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_kpi_readings_kpi_key_measured_at
  on agent_kpi_readings(kpi_key, measured_at desc);
-- Idea engine tables
create table if not exists agent_ideas (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null references agent_profiles(agent_key) on delete cascade,
  idea_type text not null check (idea_type in ('minor','major')),
  title text not null,
  summary text,
  expected_impact numeric,
  status text not null default 'proposed' check (status in ('proposed','in_review','approved','rejected','in_progress','shipped','archived')),
  requires_ceo_approval boolean not null default false,
  approver text,
  approved_at timestamptz,
  linked_task_id uuid references task_queue(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_agent_ideas_updated_at on agent_ideas;
create trigger trg_agent_ideas_updated_at
before update on agent_ideas
for each row execute function set_updated_at();
create table if not exists agent_idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references agent_ideas(id) on delete cascade,
  commenter text not null,
  comment text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_agent_idea_comments_idea_id_created_at
  on agent_idea_comments(idea_id, created_at);
-- CEO question desk tables
create table if not exists ceo_questions (
  id uuid primary key default gen_random_uuid(),
  asked_by text not null references agent_profiles(agent_key) on delete cascade,
  escalation_level text not null default 'avery' check (escalation_level in ('avery','keegan')),
  question text not null,
  context text,
  status text not null default 'open' check (status in ('open','answered','needs_followup','closed')),
  priority text,
  owner_agent text references agent_profiles(agent_key) on delete set null,
  due_at timestamptz,
  answered_by text,
  answered_at timestamptz,
  escalated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_ceo_questions_updated_at on ceo_questions;
create trigger trg_ceo_questions_updated_at
before update on ceo_questions
for each row execute function set_updated_at();
create table if not exists ceo_question_comments (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references ceo_questions(id) on delete cascade,
  commenter text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ceo_question_comments_question_id_created_at
  on ceo_question_comments(question_id, created_at);
-- Daily idea quota view
create or replace view agent_daily_idea_quota as
select
  agent_key,
  date_trunc('day', created_at) as idea_date,
  count(*) as ideas_logged,
  1 as required_ideas,
  (count(*) >= 1) as met_quota
from agent_ideas
group by agent_key, date_trunc('day', created_at);

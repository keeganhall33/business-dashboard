-- Purpose: persist opportunity research memory so unanswered/closed questions do not regenerate.

create table if not exists opportunity_research_memory_v1 (
  memory_id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity_pipeline(id) on delete cascade,
  question_id text not null,
  status text not null check (status in ('open','answered','blocked','ceiling_reached','closed')),
  last_attempted_at timestamptz,
  answer_summary text,
  supporting_refs jsonb not null default '{}'::jsonb,
  ceiling_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, question_id)
);

create index if not exists idx_opportunity_research_memory_v1_opportunity
  on opportunity_research_memory_v1(opportunity_id, updated_at desc);
create index if not exists idx_opportunity_research_memory_v1_status
  on opportunity_research_memory_v1(status);

drop trigger if exists trg_opportunity_research_memory_v1_updated_at on opportunity_research_memory_v1;
create trigger trg_opportunity_research_memory_v1_updated_at
before update on opportunity_research_memory_v1
for each row execute function set_updated_at();


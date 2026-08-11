-- Purpose: deterministic Opportunity ↔ Intelligence Graph links.
-- This table stores links (not copied facts) so discovery/ranking can roll up supported Claims/Events/Signals.

create table if not exists opportunity_graph_links_v1 (
  link_id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity_pipeline(id) on delete cascade,

  target_type text not null check (target_type in ('claim_version','event_version','signal_version','evidence_reference_version','entity')),
  target_id text not null,
  target_content_hash text,

  role text not null check (role in ('SUPPORTS','TRIGGERED_BY','CONTEXT_FOR','ACCESS_PATH','VALUE_SIGNAL','TIMING_SIGNAL')),
  match_method text not null check (match_method in ('explicit_id','entity_id','exact_org_name','alias_unambiguous')),
  confidence numeric not null,
  explanation text not null,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (opportunity_id, target_type, target_id, target_content_hash, role, match_method)
);

create index if not exists idx_opportunity_graph_links_v1_opportunity
  on opportunity_graph_links_v1(opportunity_id, created_at desc);
create index if not exists idx_opportunity_graph_links_v1_target
  on opportunity_graph_links_v1(target_type, target_id);

drop trigger if exists trg_opportunity_graph_links_v1_updated_at on opportunity_graph_links_v1;
create trigger trg_opportunity_graph_links_v1_updated_at
before update on opportunity_graph_links_v1
for each row execute function set_updated_at();

create or replace view vw_opportunity_graph_rollup_v1 as
select
  opportunity_id,
  jsonb_agg(
    jsonb_build_object(
      'target_type', target_type,
      'target_id', target_id,
      'target_content_hash', target_content_hash,
      'role', role,
      'match_method', match_method,
      'confidence', confidence,
      'explanation', explanation
    )
    order by confidence desc, created_at desc
  ) as links,
  count(*) as link_count,
  count(*) filter (where target_type = 'claim_version') as supported_claim_count,
  count(*) filter (where target_type = 'event_version') as supported_event_count,
  count(*) filter (where target_type = 'signal_version') as trigger_signal_count,
  max(updated_at) as updated_at
from opportunity_graph_links_v1
group by opportunity_id;


create table if not exists public.meta_change_proposals (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('campaign', 'adset')),
  object_id text not null,
  before_state jsonb not null,
  proposed_state jsonb not null,
  rationale text not null,
  supporting_metrics jsonb not null default '{}'::jsonb,
  confidence text not null,
  risk_tier text not null check (risk_tier in ('low', 'medium', 'high')),
  proposer text not null,
  approval_state text not null default 'PENDING' check (approval_state in ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejection_reason text,
  execution_state text not null default 'NOT_STARTED' check (execution_state in ('NOT_STARTED', 'DRY_RUN', 'SUCCEEDED', 'FAILED', 'STALE')),
  meta_response jsonb,
  executed_at timestamptz,
  idempotency_key text not null unique,
  precondition_state text not null,
  rollback_metadata jsonb,
  rollback_state text check (rollback_state in ('DRY_RUN', 'SUCCEEDED', 'FAILED')),
  rollback_response jsonb,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meta_change_proposals_explicit_approval check (
    execution_state not in ('SUCCEEDED', 'FAILED') or approval_state = 'APPROVED'
  )
);

create index if not exists meta_change_proposals_review_queue_idx
  on public.meta_change_proposals (approval_state, created_at desc);

alter table public.meta_change_proposals enable row level security;
revoke all on public.meta_change_proposals from anon, authenticated;
grant select, insert, update on public.meta_change_proposals to service_role;

comment on table public.meta_change_proposals is
  'Server-only review-mode ledger for bounded Meta campaign and ad-set budget/status proposals. Autopilot is intentionally absent.';

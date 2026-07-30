-- Milestone 11: Action Center, approvals, audit, measurement, learning (staging/local only)

begin;

-- Preflight: set_updated_at() must exist. If it doesn't, create a minimal, safe implementation.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
  ) then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;
    $fn$;
  end if;
end
$$;

-- 1) Create all seven tables first.
create table if not exists action_evidence_snapshots_v1 (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  snapshot_json jsonb not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists action_actions_v1 (
  id uuid primary key default gen_random_uuid(),

  recommendation_id text,
  opportunity_id text,

  approval_level text not null default 'L1_RECOMMENDATION' check (approval_level in (
    'L0_INSIGHT','L1_RECOMMENDATION','L2_DRAFT_PREPARED','L3_READY_FOR_APPROVAL','L4_APPROVED_FOR_EXECUTION','L5_EXECUTED_AND_MEASURED'
  )),

  title text not null,
  description text,

  category text not null,
  channel text not null,

  affected_products text[] not null default array[]::text[],
  affected_audiences text[] not null default array[]::text[],

  current_level text not null check (current_level in (
    'L0_INSIGHT','L1_RECOMMENDATION','L2_DRAFT_PREPARED','L3_READY_FOR_APPROVAL','L4_APPROVED_FOR_EXECUTION','L5_EXECUTED_AND_MEASURED'
  )),

  status text not null check (status in (
    'detected','analyzed','recommended','draft_prepared','awaiting_approval','approved','rejected','snoozed','expired',
    'needs_revalidation',
    'execution_blocked','executing','executed','measuring','successful','unsuccessful','inconclusive','cancelled'
  )),

  priority_score jsonb not null default '{}'::jsonb,
  confidence text not null check (confidence in ('confirmed','strongly_supported','likely','possible','insufficient_evidence')),

  expected_outcome text,
  estimated_impact jsonb not null default '{}'::jsonb,
  estimated_cost jsonb not null default '{}'::jsonb,
  estimated_effort jsonb not null default '{}'::jsonb,
  risk text not null default 'medium' check (risk in ('low','medium','high')),

  evidence_snapshot_id uuid references action_evidence_snapshots_v1(id) on delete set null,
  evidence_snapshot_hash text,

  assumptions text[] not null default array[]::text[],
  limitations text[] not null default array[]::text[],

  prepared_assets jsonb not null default '[]'::jsonb,
  execution_plan jsonb not null default '{}'::jsonb,
  approval_requirements jsonb not null default '{}'::jsonb,

  last_idempotency_key text,

  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  rejection_reason text,

  snoozed_until timestamptz,
  expires_at timestamptz,

  executed_at timestamptz,

  measurement_window jsonb not null default '{}'::jsonb,
  baseline_snapshot jsonb,
  result_snapshot jsonb,
  outcome jsonb,
  lessons text,

  recommendation_fingerprint text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists action_measurement_plans_v1 (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(action_id)
);

create table if not exists action_audit_events_v1 (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  from_level text,
  to_level text,
  actor text not null,
  idempotency_key text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists action_comments_v1 (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists action_preferences_v1 (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  category text,
  suppressed boolean not null default false,
  suppress_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(fingerprint)
);

create table if not exists action_synthetic_outcomes_v1 (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  outcome_status text not null check (outcome_status in ('successful','unsuccessful','inconclusive','stopped_early')),
  outcome_json jsonb not null,
  created_at timestamptz not null default now()
);

-- 2) Indexes and triggers only after tables exist.
create index if not exists idx_action_evidence_snapshots_fingerprint_created_at
  on action_evidence_snapshots_v1(fingerprint, created_at desc);

create index if not exists idx_action_actions_status_updated_at
  on action_actions_v1(status, updated_at desc);
create index if not exists idx_action_actions_level_status
  on action_actions_v1(current_level, status);

-- Prevent duplicate active actions for the same recommendation fingerprint.
create unique index if not exists idx_action_actions_fingerprint_active_unique
  on action_actions_v1(recommendation_fingerprint)
  where status in ('detected','analyzed','recommended','draft_prepared','awaiting_approval','approved','rejected','snoozed','needs_revalidation','execution_blocked','executing','measuring');

create index if not exists idx_action_audit_events_action_created_at
  on action_audit_events_v1(action_id, created_at asc);

create index if not exists idx_action_comments_action_created_at
  on action_comments_v1(action_id, created_at asc);

create index if not exists idx_action_synth_outcomes_action_created_at
  on action_synthetic_outcomes_v1(action_id, created_at asc);

drop trigger if exists trg_action_actions_updated_at on action_actions_v1;
create trigger trg_action_actions_updated_at
before update on action_actions_v1
for each row execute function set_updated_at();

drop trigger if exists trg_action_measurement_plans_updated_at on action_measurement_plans_v1;
create trigger trg_action_measurement_plans_updated_at
before update on action_measurement_plans_v1
for each row execute function set_updated_at();

drop trigger if exists trg_action_preferences_updated_at on action_preferences_v1;
create trigger trg_action_preferences_updated_at
before update on action_preferences_v1
for each row execute function set_updated_at();

-- 3) Enable RLS only after all seven tables exist.
alter table action_evidence_snapshots_v1 enable row level security;
alter table action_actions_v1 enable row level security;
alter table action_measurement_plans_v1 enable row level security;
alter table action_audit_events_v1 enable row level security;
alter table action_comments_v1 enable row level security;
alter table action_preferences_v1 enable row level security;
alter table action_synthetic_outcomes_v1 enable row level security;

commit;

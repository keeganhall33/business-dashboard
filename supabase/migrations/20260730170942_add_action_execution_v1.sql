-- Milestone 12: execution boundary persistence (mock-only)
-- Safety:
-- - Additive tables only
-- - RLS enabled, no anonymous policies
-- - Does not modify Milestone 11 tables

begin;

-- Feature-owned updated_at trigger
create or replace function action_execution_set_updated_at_v1()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Execution requests
create table if not exists action_execution_requests_v1 (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  adapter_id text not null,
  requested_by text not null,
  execution_state text not null,
  payload_hash text not null,
  payload_json jsonb not null,
  action_state_hash text not null,
  reversibility text not null,
  irreversible_reason text null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  idempotency_key text not null,
  harness_run_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_execution_requests_state_check check (
    execution_state in (
      'requested','dry_run_succeeded','confirmation_required','confirmed','queued','started',
      'succeeded','partial_succeeded','failed','timeout','cancel_requested','cancelled',
      'rollback_requested','rolled_back','rollback_failed','blocked'
    )
  ),
  constraint action_execution_requests_reversibility_check check (reversibility in ('reversible','partially_reversible','irreversible')),
  constraint action_execution_requests_irreversible_reason_check check (
    (reversibility = 'irreversible' and irreversible_reason is not null and length(trim(irreversible_reason)) > 0)
    or
    (reversibility <> 'irreversible')
  )
);

create unique index if not exists action_execution_requests_action_idempotency_uniq_v1
  on action_execution_requests_v1(action_id, idempotency_key);

create index if not exists action_execution_requests_action_state_v1 on action_execution_requests_v1(action_id, execution_state);
create index if not exists action_execution_requests_recency_v1 on action_execution_requests_v1(action_id, requested_at desc);
create index if not exists action_execution_requests_state_recency_v1 on action_execution_requests_v1(execution_state, requested_at desc);

alter table action_execution_requests_v1 enable row level security;

create trigger action_execution_requests_set_updated_at_v1
before update on action_execution_requests_v1
for each row execute function action_execution_set_updated_at_v1();

-- 2) Confirmations
create table if not exists action_execution_confirmations_v1 (
  id uuid primary key default gen_random_uuid(),
  execution_request_id uuid not null references action_execution_requests_v1(id) on delete cascade,
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  confirmation_expires_at timestamptz not null,
  payload_hash text not null,
  action_state_hash text not null,
  approval_snapshot jsonb not null,
  irreversible_acknowledged boolean not null default false,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  constraint action_execution_confirmations_current_one_check check (is_current in (true,false))
);

create unique index if not exists action_execution_confirmations_one_current_v1
  on action_execution_confirmations_v1(execution_request_id)
  where is_current;

create index if not exists action_execution_confirmations_expiry_v1
  on action_execution_confirmations_v1(execution_request_id, confirmation_expires_at);

alter table action_execution_confirmations_v1 enable row level security;

-- 3) Attempts
create table if not exists action_execution_attempts_v1 (
  id uuid primary key default gen_random_uuid(),
  execution_request_id uuid not null references action_execution_requests_v1(id) on delete cascade,
  attempt_index int not null,
  idempotency_key text not null,
  status text not null,
  started_at timestamptz null,
  ended_at timestamptz null,
  provider_execution_id text null,
  result_json jsonb null,
  external_side_effect_count int not null default 0,
  created_at timestamptz not null default now(),
  constraint action_execution_attempts_status_check check (
    status in ('started','succeeded','partial_succeeded','failed','timeout','cancel_requested','cancelled')
  ),
  constraint action_execution_attempts_external_effects_zero_check check (external_side_effect_count = 0)
);

create unique index if not exists action_execution_attempts_request_attempt_uniq_v1
  on action_execution_attempts_v1(execution_request_id, attempt_index);

create index if not exists action_execution_attempts_status_v1
  on action_execution_attempts_v1(execution_request_id, status);

alter table action_execution_attempts_v1 enable row level security;

-- 4) Steps
create table if not exists action_execution_steps_v1 (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references action_execution_attempts_v1(id) on delete cascade,
  step_index int not null,
  name text not null,
  status text not null,
  details jsonb null,
  created_at timestamptz not null default now(),
  constraint action_execution_steps_status_check check (status in ('pending','running','succeeded','failed','skipped'))
);

create unique index if not exists action_execution_steps_attempt_step_uniq_v1
  on action_execution_steps_v1(attempt_id, step_index);

create index if not exists action_execution_steps_attempt_order_v1
  on action_execution_steps_v1(attempt_id, step_index);

alter table action_execution_steps_v1 enable row level security;

-- 5) Locks (one row per action)
create table if not exists action_execution_locks_v1 (
  action_id uuid primary key references action_actions_v1(id) on delete cascade,
  execution_request_id uuid null references action_execution_requests_v1(id) on delete set null,
  lock_owner text not null,
  lock_reason text not null,
  lock_acquired_at timestamptz not null default now(),
  lock_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists action_execution_locks_expiry_v1
  on action_execution_locks_v1(lock_expires_at);

alter table action_execution_locks_v1 enable row level security;

create trigger action_execution_locks_set_updated_at_v1
before update on action_execution_locks_v1
for each row execute function action_execution_set_updated_at_v1();

-- 6) Idempotency ledger
create table if not exists action_execution_idempotency_v1 (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  action_id uuid not null references action_actions_v1(id) on delete cascade,
  execution_request_id uuid null references action_execution_requests_v1(id) on delete set null,
  idempotency_key text not null,
  request_hash text not null,
  response_snapshot jsonb not null,
  completion_state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_execution_idempotency_completion_check check (completion_state in ('started','completed','failed'))
);

create unique index if not exists action_execution_idempotency_key_uniq_v1
  on action_execution_idempotency_v1(operation_type, action_id, idempotency_key);

create index if not exists action_execution_idempotency_lookup_v1
  on action_execution_idempotency_v1(action_id, operation_type, created_at desc);

alter table action_execution_idempotency_v1 enable row level security;

create trigger action_execution_idempotency_set_updated_at_v1
before update on action_execution_idempotency_v1
for each row execute function action_execution_set_updated_at_v1();

-- 7) Rollbacks
create table if not exists action_execution_rollbacks_v1 (
  id uuid primary key default gen_random_uuid(),
  execution_request_id uuid not null references action_execution_requests_v1(id) on delete cascade,
  execution_attempt_id uuid null references action_execution_attempts_v1(id) on delete set null,
  requested_by text not null,
  confirmed_by text null,
  rollback_state text not null,
  rollback_plan_hash text null,
  preview_json jsonb null,
  result_json jsonb null,
  started_at timestamptz null,
  ended_at timestamptz null,
  external_side_effect_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_execution_rollbacks_state_check check (
    rollback_state in ('rollback_requested','started','rolled_back','rollback_failed','cancelled')
  ),
  constraint action_execution_rollbacks_external_effects_zero_check check (external_side_effect_count = 0)
);

create index if not exists action_execution_rollbacks_request_v1
  on action_execution_rollbacks_v1(execution_request_id, created_at desc);

create index if not exists action_execution_rollbacks_attempt_v1
  on action_execution_rollbacks_v1(execution_attempt_id);

alter table action_execution_rollbacks_v1 enable row level security;

create trigger action_execution_rollbacks_set_updated_at_v1
before update on action_execution_rollbacks_v1
for each row execute function action_execution_set_updated_at_v1();

commit;

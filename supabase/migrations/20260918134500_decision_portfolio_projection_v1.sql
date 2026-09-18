-- Append-only projection for canonical Autonomous Growth decision portfolios.
-- This table does not create a second decision source of truth: it stores the
-- exact DecisionPortfolioV1 payload plus a deterministic content hash so live
-- loaders can prove replay equivalence before surfacing decision-grade state.

begin;

create table exec_dashboard.decision_portfolio_projection_v1 (
  portfolio_id text primary key
    check (portfolio_id ~ '^decision_portfolio_[a-f0-9]{20}$'),
  contract_version text not null
    check (contract_version = 'DecisionPortfolioV1'),
  policy_version text not null
    check (length(btrim(policy_version)) > 0),
  generated_at timestamptz not null,
  content_hash text not null
    check (content_hash ~ '^[a-f0-9]{64}$'),
  evidence_refs text[] not null default '{}',
  source_refs text[] not null default '{}',
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ->> 'contractVersion' = contract_version
    and payload ->> 'policyVersion' = policy_version
    and payload ->> 'portfolioId' = portfolio_id
    and (payload ->> 'generatedAt')::timestamptz = generated_at
  ),
  persisted_at timestamptz not null default now(),
  constraint decision_portfolio_projection_persisted_after_generated_v1
    check (persisted_at >= generated_at)
);

create index decision_portfolio_projection_generated_at_v1
  on exec_dashboard.decision_portfolio_projection_v1 (generated_at desc, portfolio_id);

alter table exec_dashboard.decision_portfolio_projection_v1 enable row level security;
alter table exec_dashboard.decision_portfolio_projection_v1 force row level security;

revoke all on table exec_dashboard.decision_portfolio_projection_v1
  from public, anon, authenticated;
grant select, insert on table exec_dashboard.decision_portfolio_projection_v1
  to service_role;

create policy decision_portfolio_projection_service_read_v1
  on exec_dashboard.decision_portfolio_projection_v1
  for select
  to service_role
  using (true);

create policy decision_portfolio_projection_service_insert_v1
  on exec_dashboard.decision_portfolio_projection_v1
  for insert
  to service_role
  with check (true);

create or replace view public.decision_portfolio_projection_v1
with (security_invoker = true) as
select
  portfolio_id,
  contract_version,
  policy_version,
  generated_at,
  content_hash,
  evidence_refs,
  source_refs,
  payload,
  persisted_at
from exec_dashboard.decision_portfolio_projection_v1;

revoke all on table public.decision_portfolio_projection_v1
  from public, anon, authenticated;
grant select on table public.decision_portfolio_projection_v1
  to service_role;

create or replace function public.persist_decision_portfolio_projection_v1(
  in_portfolio_id text,
  in_contract_version text,
  in_policy_version text,
  in_generated_at timestamptz,
  in_content_hash text,
  in_evidence_refs text[],
  in_source_refs text[],
  in_payload jsonb
)
returns table(status text, portfolio_id text, content_hash text)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  inserted_hash text;
  existing_hash text;
begin
  if in_generated_at > statement_timestamp() then
    raise exception using errcode = '22023', message = 'decision_portfolio_generated_at_future';
  end if;

  insert into exec_dashboard.decision_portfolio_projection_v1 (
    portfolio_id,
    contract_version,
    policy_version,
    generated_at,
    content_hash,
    evidence_refs,
    source_refs,
    payload
  ) values (
    in_portfolio_id,
    in_contract_version,
    in_policy_version,
    in_generated_at,
    in_content_hash,
    coalesce(in_evidence_refs, '{}'),
    coalesce(in_source_refs, '{}'),
    in_payload
  )
  on conflict (portfolio_id) do nothing
  returning decision_portfolio_projection_v1.content_hash
  into inserted_hash;

  if inserted_hash is not null then
    return query select 'PERSISTED'::text, in_portfolio_id, inserted_hash;
    return;
  end if;

  select p.content_hash
    into existing_hash
  from exec_dashboard.decision_portfolio_projection_v1 p
  where p.portfolio_id = in_portfolio_id;

  if existing_hash = in_content_hash then
    return query select 'IDEMPOTENT'::text, in_portfolio_id, existing_hash;
  else
    return query select 'CONFLICTING'::text, in_portfolio_id, existing_hash;
  end if;
end;
$function$;

revoke all on function public.persist_decision_portfolio_projection_v1(
  text, text, text, timestamptz, text, text[], text[], jsonb
) from public, anon, authenticated;
grant execute on function public.persist_decision_portfolio_projection_v1(
  text, text, text, timestamptz, text, text[], text[], jsonb
) to service_role;

commit;

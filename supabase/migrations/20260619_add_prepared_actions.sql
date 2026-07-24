-- Prepared Actions Queue v1
-- Adds prepared_actions table, supporting enum, indexes, and seed drafts.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'prepared_action_status'
  ) then
    create type prepared_action_status as enum (
      'draft',
      'ready_for_review',
      'approved',
      'rejected',
      'manually_executed',
      'archived'
    );
  end if;
end $$;

create table if not exists prepared_actions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('website','product','email','meta','tracking','collector','operations','partnership')),
  source_panel text not null,
  source_insight_id text,
  source_snapshot_at timestamptz,
  source_url text,
  dedupe_key text,
  why_it_matters text not null,
  evidence jsonb not null default '[]'::jsonb,
  prepared_asset jsonb not null default '[]'::jsonb,
  estimated_impact text,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  data_light boolean not null default false,
  required_approval_action text not null,
  status prepared_action_status not null default 'draft',
  created_by_agent text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  approval_note text,
  rejected_at timestamptz,
  rejection_reason text,
  manually_executed_at timestamptz,
  manual_execution_note text,
  archived_at timestamptz,
  expires_at timestamptz,
  notes text
);

create trigger set_prepared_actions_updated_at
before update on prepared_actions
for each row execute function set_updated_at();

create index if not exists prepared_actions_status_updated_idx on prepared_actions (status, updated_at);
create index if not exists prepared_actions_category_status_idx on prepared_actions (category, status);
create index if not exists prepared_actions_expires_at_idx on prepared_actions (expires_at) where expires_at is not null;
create index if not exists prepared_actions_dedupe_key_idx on prepared_actions (dedupe_key) where dedupe_key is not null;

create unique index if not exists prepared_actions_dedupe_active_idx
  on prepared_actions (dedupe_key)
  where dedupe_key is not null and status in ('draft','ready_for_review','approved');

-- Initial draft actions sourced from existing dashboard insights.
insert into prepared_actions (
  title,
  category,
  source_panel,
  source_insight_id,
  source_snapshot_at,
  source_url,
  dedupe_key,
  why_it_matters,
  evidence,
  prepared_asset,
  estimated_impact,
  risk_level,
  confidence,
  data_light,
  required_approval_action,
  created_by_agent,
  expires_at
)
values
  (
    'Checkout friction audit',
    'website',
    'funnel_performance',
    'funnel-cart-checkout',
    timezone('utc', now()),
    '/dashboard?section=funnel',
    'checkout-friction',
    'Cart → checkout drop is the biggest leak; conversion recovery is blocked until we investigate trust signals.',
    '[{"label":"Add_to_cart","value":"276"},{"label":"Begin_checkout","value":"9"},{"label":"Purchases","value":"3"}]'::jsonb,
    '[{"label":"Checklist","value":"Audit shipping copy, payment icons, checkout promise."}]'::jsonb,
    'Reduce drop-off to restore revenue velocity.',
    'high',
    'medium',
    false,
    'Approve checkout friction audit (manual execution only).',
    'system',
    timezone('utc', now()) + interval '14 days'
  ),
  (
    'Acuña / Topps product promotion',
    'product',
    'product_performance',
    'product-acuna-topps',
    timezone('utc', now()),
    '/dashboard?section=product',
    'acuna-topps-promo',
    'One SKU controls nearly 100% of Woo revenue; need a backup hero before supply or narrative shifts.',
    '[{"label":"Revenue concentration","value":"100%"}]'::jsonb,
    '[{"label":"Copy","value":"Feature alternative hero + collector proof."}]'::jsonb,
    'Diversify cash flow away from a single piece.',
    'medium',
    'medium',
    false,
    'Approve backup hero promotion plan.',
    'system',
    timezone('utc', now()) + interval '10 days'
  ),
  (
    'Meta creative refresh test',
    'meta',
    'paid_performance',
    'meta-creative-refresh',
    timezone('utc', now()),
    '/dashboard?section=paid',
    'meta-creative-refresh',
    'ROAS is 1.39x on thin data; creative fatigue risk and we cannot scale until the hook resets.',
    '[{"label":"Spend","value":"$61.10"},{"label":"ROAS","value":"1.39x"},{"label":"Purchases","value":"1"}]'::jsonb,
    '[{"label":"Brief","value":"Outline new hook + hero story."}]'::jsonb,
    'Stabilize Meta efficiency before reintroducing budget.',
    'medium',
    'low',
    true,
    'Approve creative refresh test (no auto-execution).',
    'system',
    timezone('utc', now()) + interval '7 days'
  );

comment on table prepared_actions is 'Prepared action queue items. Apply RLS to restrict access to dashboard service roles only.';

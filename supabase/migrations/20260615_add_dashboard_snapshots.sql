create table if not exists public.dashboard_snapshots (
  key text primary key,
  payload jsonb not null,
  mode text,
  generated_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.dashboard_snapshots is 'Latest dashboard artifact payloads (website/cloudflare) used by the production UI.';
comment on column public.dashboard_snapshots.key is 'Snapshot identifier (e.g., website, cloudflare).';
comment on column public.dashboard_snapshots.mode is 'Status flag reported by the ingestion agent (LIVE/PARTIAL/BROKEN/SNAPSHOT).';
comment on column public.dashboard_snapshots.generated_at is 'Timestamp supplied by the ingestion agent for when the payload was generated.';

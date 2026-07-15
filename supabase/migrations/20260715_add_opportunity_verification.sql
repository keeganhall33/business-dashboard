-- Phase 3E.1: add opportunity verification metadata
alter table public.opportunity_pipeline
  add column if not exists verification_status text not null default 'unverified'
    check (
      verification_status in (
        'unverified',
        'verified_active',
        'verified_on_hold',
        'verified_complete',
        'verified_declined',
        'invalid',
        'stale'
      )
    ),
  add column if not exists verification_source text,
  add column if not exists verification_notes text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_verified_by text,
  add column if not exists value_basis text,
  add column if not exists confidence numeric
    check (confidence is null or confidence between 0 and 1);

create index if not exists idx_opportunity_pipeline_verification_status
  on public.opportunity_pipeline(verification_status, updated_at desc);

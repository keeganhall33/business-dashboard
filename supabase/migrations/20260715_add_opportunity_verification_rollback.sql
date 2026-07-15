-- Rollback for opportunity verification metadata
create index if not exists idx_opportunity_pipeline_verification_status_dummy on public.opportunity_pipeline (updated_at);

-- Drop new columns/index when rolling back
begin;
  drop index if exists idx_opportunity_pipeline_verification_status;
  alter table public.opportunity_pipeline
    drop column if exists confidence,
    drop column if exists value_basis,
    drop column if exists last_verified_by,
    drop column if exists last_verified_at,
    drop column if exists verification_notes,
    drop column if exists verification_source,
    drop column if exists verification_status;
commit;

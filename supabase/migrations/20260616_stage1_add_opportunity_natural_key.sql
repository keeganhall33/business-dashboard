begin;

create extension if not exists pgcrypto;

create table if not exists public.opportunity_pipeline_backup_20260616 as
select * from public.opportunity_pipeline;

alter table if exists public.opportunity_pipeline
  add column if not exists natural_key text;

update public.opportunity_pipeline
set natural_key = encode(
      digest(
        regexp_replace(lower(trim(coalesce(name, ''))), '\\s+', ' ', 'g')
        || '|' ||
        regexp_replace(lower(trim(coalesce(organization, ''))), '\\s+', ' ', 'g'),
        'sha256'
      ),
      'hex'
    )
where natural_key is null;

commit;

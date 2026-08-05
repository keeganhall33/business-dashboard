-- Phase B2 rollback: drop only B2 tables.
-- Dependency-safe order.

begin;

drop function if exists public.persist_sports_milestone_v1(
  text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,text,text,date,date,integer,text,text,text,jsonb,text
);
drop function if exists public.recover_expired_external_collection_leases_v1();
drop function if exists public.release_external_collection_job_lease_v1(text,text,text);
drop function if exists public.renew_external_collection_job_lease_v1(text,text,integer);
drop function if exists public.lease_external_collection_job_v1(text,integer,integer,integer);

drop table if exists public.sports_milestone_alerts_v1;
drop table if exists public.sports_milestone_versions_v1;
drop table if exists public.sports_milestones_v1;

drop table if exists public.external_collection_health_v1;
drop table if exists public.external_collection_jobs_v1;
drop table if exists public.external_collection_schedules_v1;

commit;

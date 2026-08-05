-- Phase B2 rollback: drop only B2 tables.
-- Dependency-safe order.

begin;

drop table if exists public.sports_milestone_alerts_v1;
drop table if exists public.sports_milestone_versions_v1;
drop table if exists public.sports_milestones_v1;

drop table if exists public.external_collection_health_v1;
drop table if exists public.external_collection_jobs_v1;
drop table if exists public.external_collection_schedules_v1;

commit;

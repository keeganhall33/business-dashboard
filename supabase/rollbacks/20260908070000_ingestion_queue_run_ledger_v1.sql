begin;

drop function if exists public.recover_expired_ingestion_leases_v1(integer);
drop function if exists public.fail_ingestion_run_v1(uuid,uuid,text,uuid,text,text,jsonb);
drop function if exists public.complete_ingestion_run_v1(uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,jsonb,text,text,jsonb);
drop function if exists public.heartbeat_ingestion_run_v1(uuid,uuid,text,uuid,integer);
drop function if exists public.start_ingestion_run_v1(uuid,uuid,text,uuid);
drop function if exists public.claim_ingestion_job_v1(text,text,integer);
drop function if exists public.enqueue_ingestion_job_v1(text,text,text,text,text,integer,timestamptz,text,text,jsonb,jsonb,timestamptz,timestamptz,integer,integer,integer);

drop table if exists ingestion_private.ingestion_dead_letters_v1;
drop table if exists ingestion_private.ingestion_run_events_v1;
drop table if exists ingestion_private.ingestion_runs_v1;
drop table if exists ingestion_private.ingestion_jobs_v1;
drop schema if exists ingestion_private;

commit;

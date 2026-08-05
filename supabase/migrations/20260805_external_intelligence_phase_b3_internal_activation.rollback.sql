begin;

-- B3 rollback: remove B3-owned durable lock + internal job registry only.

drop function if exists public.release_internal_orchestration_lock_v1(text,text);
drop function if exists public.renew_internal_orchestration_lock_v1(text,text,integer);
drop function if exists public.acquire_internal_orchestration_lock_v1(text,text,integer);

drop table if exists public.internal_orchestration_jobs_v1;
drop table if exists public.internal_orchestration_locks_v1;

commit;

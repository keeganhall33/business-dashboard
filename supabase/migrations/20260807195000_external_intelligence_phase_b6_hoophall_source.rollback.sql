begin;

drop function if exists public.enable_hoophall_collection_v1(text,text);
drop function if exists public.disable_hoophall_collection_v1(text,text);

-- Leave schedule row present but ensure disabled.
update public.external_collection_schedules_v1
  set enabled = false, next_run_at = null, updated_at = now()
  where schedule_id = 'sports.basketball.hoophall.official:production'
    and source_id = 'sports.basketball.hoophall.official';

commit;


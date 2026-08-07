begin;

-- Keep data but remove operator RPCs.
drop function if exists public.enable_external_lifecycle_probe_v1(text,text,text);
drop function if exists public.disable_external_lifecycle_probe_v1(text,text);

-- Leave the schedule row in place but ensure it is disabled.
update public.external_collection_schedules_v1
  set enabled = false, next_run_at = null, updated_at = now()
  where schedule_id = 'internal.lifecycle_probe:production'
    and source_id = 'internal.lifecycle_probe';

commit;

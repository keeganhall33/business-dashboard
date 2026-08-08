begin;

drop function if exists public.enable_boardroom_collection_v1(text,text);
drop function if exists public.disable_boardroom_collection_v1(text,text);

delete from public.external_collection_schedules_v1
  where schedule_id = 'sports_business.boardroom:production'
    and source_id = 'sports_business.boardroom'
    and environment = 'production';

commit;


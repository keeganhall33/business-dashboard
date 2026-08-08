begin;

-- Rollback for Phase B4 atomic recurring activation.

drop function if exists public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
);

drop function if exists public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
);

commit;


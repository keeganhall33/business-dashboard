-- 2026-07-14: Add public wrapper for the Woo semantic RPC

create or replace function public.get_woo_metrics_semantic_v1(start_date date, end_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, exec_dashboard
as $$
  select exec_dashboard.get_woo_metrics_semantic(start_date, end_date);
$$;

alter function public.get_woo_metrics_semantic_v1(date, date) owner to postgres;

revoke execute on function public.get_woo_metrics_semantic_v1(date, date) from public;
revoke execute on function public.get_woo_metrics_semantic_v1(date, date) from anon;
revoke execute on function public.get_woo_metrics_semantic_v1(date, date) from authenticated;
grant execute on function public.get_woo_metrics_semantic_v1(date, date) to service_role;

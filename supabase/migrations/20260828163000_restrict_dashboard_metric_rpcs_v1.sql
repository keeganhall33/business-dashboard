revoke all on function public.get_dashboard_metrics(date,date) from public;
revoke all on function public.get_dashboard_metrics(date,date) from anon;
revoke all on function public.get_dashboard_metrics(date,date) from authenticated;
grant execute on function public.get_dashboard_metrics(date,date) to service_role;

revoke all on function public.get_ga4_metrics(date,date) from public;
revoke all on function public.get_ga4_metrics(date,date) from anon;
revoke all on function public.get_ga4_metrics(date,date) from authenticated;
grant execute on function public.get_ga4_metrics(date,date) to service_role;

revoke all on function public.get_funnelkit_metrics(date,date) from public;
revoke all on function public.get_funnelkit_metrics(date,date) from anon;
revoke all on function public.get_funnelkit_metrics(date,date) from authenticated;
grant execute on function public.get_funnelkit_metrics(date,date) to service_role;

revoke all on function public.get_woo_metrics(date,date) from public;
revoke all on function public.get_woo_metrics(date,date) from anon;
revoke all on function public.get_woo_metrics(date,date) from authenticated;
grant execute on function public.get_woo_metrics(date,date) to service_role;

revoke all on function public.debug_request_jwt_role_definer_v1() from public;
revoke all on function public.debug_request_jwt_role_definer_v1() from anon;
revoke all on function public.debug_request_jwt_role_definer_v1() from authenticated;
grant execute on function public.debug_request_jwt_role_definer_v1() to service_role;

create or replace function public.ingest_ga4_raw_events_v2(
  p_rows jsonb,
  p_run_started timestamptz,
  p_start_date text,
  p_end_date text
)
returns integer
language plpgsql
security definer
set search_path to 'public','exec_dashboard'
as $function$
declare
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  insert into exec_dashboard.raw_ga4_events (
    event_date, page_path, page_title, device_category, traffic_source, event_name,
    event_count, sessions, engaged_sessions, user_engagement_duration_ms, revenue, metadata
  )
  select
    r.event_date,
    r.page_path,
    max(r.page_title) as page_title,
    r.device_category,
    r.traffic_source,
    r.event_name,
    sum(r.event_count)::integer,
    sum(r.sessions)::integer,
    sum(r.engaged_sessions)::integer,
    sum(r.user_engagement_duration_ms)::numeric,
    sum(r.revenue)::numeric,
    jsonb_build_object(
      'ingestion','ga4_data_api_v2',
      'sourceRange',jsonb_build_object('startDate',p_start_date,'endDate',p_end_date),
      'ingestedAt',now(),
      'collapsedRows',count(*)
    )
  from jsonb_to_recordset(p_rows) as r(
    event_date date,
    page_path text,
    page_title text,
    device_category text,
    traffic_source text,
    event_name text,
    event_count integer,
    sessions integer,
    engaged_sessions integer,
    user_engagement_duration_ms numeric,
    revenue numeric,
    metadata jsonb
  )
  group by r.event_date, r.page_path, r.device_category, r.traffic_source, r.event_name
  on conflict (event_date, page_path, device_category, traffic_source, event_name)
  do update set
    page_title = excluded.page_title,
    event_count = excluded.event_count,
    sessions = excluded.sessions,
    engaged_sessions = excluded.engaged_sessions,
    user_engagement_duration_ms = excluded.user_engagement_duration_ms,
    revenue = excluded.revenue,
    metadata = excluded.metadata;

  get diagnostics v_count = row_count;

  insert into exec_dashboard.ingest_runs(
    source, run_started, run_finished, status, woo_orders, ga4_rows, funnelkit_steps, error
  ) values (
    'ga4_data_api_v2', p_run_started, now(), 'success', 0, v_count, 0, null
  );

  return v_count;
end;
$function$;

revoke all on function public.ingest_ga4_raw_events_v2(jsonb,timestamptz,text,text) from public;
revoke all on function public.ingest_ga4_raw_events_v2(jsonb,timestamptz,text,text) from anon;
revoke all on function public.ingest_ga4_raw_events_v2(jsonb,timestamptz,text,text) from authenticated;
grant execute on function public.ingest_ga4_raw_events_v2(jsonb,timestamptz,text,text) to service_role;

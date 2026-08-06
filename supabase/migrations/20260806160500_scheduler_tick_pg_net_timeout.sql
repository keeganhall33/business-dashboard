begin;

-- Increase pg_net request timeout for scheduler tick.
-- Evidence: on 2026-08-06 23:00 UTC (cron run 67), Fly cold-started the machine and the route
-- completed ~8s after request start, while pg_net default timeout (5000ms) elapsed first.
-- This change does not affect auth, URL, cadence, or Vault lookup; it only raises the client timeout.

create or replace function public.run_production_scheduler_tick_v1()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text := 'https://mission.keeganhall.com/api/scheduler/tick';
  v_secret text;
  v_secret_rows integer;
  v_headers jsonb;
  v_request_id bigint;
  v_timeout_ms integer := 15000;
begin
  select count(*) into v_secret_rows
  from vault.decrypted_secrets
  where name = 'scheduler_secret';

  if v_secret_rows <> 1 then
    raise exception using message = 'scheduler_secret_unavailable';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'scheduler_secret'
  limit 1;

  if v_secret is null or length(v_secret) = 0 then
    raise exception using message = 'scheduler_secret_unavailable';
  end if;

  v_headers := jsonb_build_object(
    'Authorization', 'Bearer ' || v_secret,
    'Content-Type', 'application/json'
  );

  select net.http_post(
    url := v_url,
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := v_timeout_ms
  ) into v_request_id;

  if v_request_id is null then
    raise exception using message = 'scheduler_tick_request_not_queued';
  end if;
end;
$$;

revoke all on function public.run_production_scheduler_tick_v1() from public;
revoke all on function public.run_production_scheduler_tick_v1() from anon;
revoke all on function public.run_production_scheduler_tick_v1() from authenticated;
grant execute on function public.run_production_scheduler_tick_v1() to service_role;

commit;

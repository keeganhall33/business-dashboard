begin;

-- Roll back pg_net timeout override by restoring the default (5000ms) call signature.

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
    body := '{}'::jsonb
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

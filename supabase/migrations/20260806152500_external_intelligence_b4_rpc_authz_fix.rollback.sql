begin;

-- Roll back the B4 RPC auth fix by restoring the immediately previous definitions
-- that gated on session_user. (This restores the pre-fix behavior.)

create or replace function public.activate_external_intelligence_internal_orchestration_v1(
  in_activation_id text,
  in_configuration_version text,
  in_configuration_hash text,
  in_environment text,
  in_requested_by text,
  in_requested_at timestamptz,
  in_review_by text,
  in_governing_policy_reference text,
  in_expected_project_ref text
)
returns table (
  activation_id text,
  configuration_hash text,
  created_new_activation boolean,
  idempotent_replay boolean,
  result_code text,
  heartbeat_row jsonb,
  internal_jobs jsonb,
  safety_snapshot jsonb,
  audit_state_key text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now timestamptz := timezone('utc', now());
  v_expected_project_ref constant text := 'ibjsjosplgbqevmnvvpf';

  v_job_key constant text := 'external-intelligence-heartbeat';
  v_job_name constant text := 'External intelligence heartbeat';
  v_cron_expression constant text := '0 * * * *';
  v_timezone constant text := 'UTC';
  v_route_path constant text := '/api/scheduler/tick';

  v_active_lease_count integer := 0;
  v_enabled_external_schedules integer := 0;
  v_active_external_jobs integer := 0;

  v_existing_sched record;
  v_sched_next timestamptz;

  v_existing_active_hash text;
  v_state record;
  v_is_already_active boolean := false;

  v_unknown_enabled_jobs integer := 0;
  v_enabled_approved_jobs integer := 0;

  v_pre jsonb;
  v_post jsonb;
  v_audit_key text;
  v_state_key constant text := 'external_intelligence_recurring_internal_orchestration_state_v1';

  v_next_hour timestamptz;
  v_next_midnight timestamptz;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if coalesce(nullif(in_activation_id, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_activation_id';
  end if;
  if coalesce(nullif(in_configuration_version, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_configuration_version';
  end if;
  if coalesce(nullif(in_configuration_hash, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_configuration_hash';
  end if;
  if in_environment is distinct from 'production' then
    raise exception using errcode = '22023', message = 'invalid_environment';
  end if;
  if in_expected_project_ref is distinct from v_expected_project_ref then
    raise exception using errcode = 'P0001', message = 'project_ref_mismatch';
  end if;

  v_audit_key := 'external_intelligence_recurring_activation_v1:' || in_activation_id;
  insert into public.system_state(key, value_json, updated_at)
  values (v_audit_key, jsonb_build_object('status', 'claimed', 'claimed_at', v_now), v_now)
  on conflict (key) do nothing;
  if not found then
    raise exception using errcode = 'P0001', message = 'activation_already_claimed';
  end if;

  select count(*) into v_active_lease_count
  from public.internal_orchestration_locks_v1
  where lock_key = v_job_key
    and expires_at is not null
    and expires_at > v_now;

  select count(*) into v_enabled_external_schedules
  from public.external_collection_schedules_v1
  where enabled = true
    and environment = 'production';

  select (
    (select count(*) from public.external_collection_jobs_v1 where status in ('queued','leased','running'))
    +
    (select count(*)
      from public.external_collection_jobs_v1
      where status = 'retry_wait'
        and (next_retry_at is null or next_retry_at <= v_now)
    )
  ) into v_active_external_jobs;

  select count(*) into v_unknown_enabled_jobs
  from public.internal_orchestration_jobs_v1
  where environment = 'production'
    and enabled = true
    and job_name not in (
      'external-source-watchdog-v1',
      'milestone-horizon-scan-v1',
      'expired-lease-recovery-v1',
      'expired-milestone-alert-cleanup-v1'
    );
  if v_unknown_enabled_jobs <> 0 then
    raise exception using errcode = 'P0001', message = 'unknown_internal_job_enabled';
  end if;

  v_pre := jsonb_build_object(
    'now', v_now,
    'active_heartbeat_leases', v_active_lease_count,
    'enabled_external_schedules', v_enabled_external_schedules,
    'active_external_jobs', v_active_external_jobs,
    'unknown_enabled_internal_jobs', v_unknown_enabled_jobs
  );

  if v_active_lease_count <> 0 then
    raise exception using errcode = 'P0001', message = 'active_heartbeat_lease_present';
  end if;
  if v_enabled_external_schedules <> 0 then
    raise exception using errcode = 'P0001', message = 'external_schedules_enabled';
  end if;
  if v_active_external_jobs <> 0 then
    raise exception using errcode = 'P0001', message = 'active_external_jobs_present';
  end if;

  select value_json into v_state
  from public.system_state
  where key = v_state_key;
  if v_state is not null then
    v_existing_active_hash := v_state.value_json->>'configuration_hash';
    v_is_already_active := (v_state.value_json->>'active')::boolean;
  end if;

  if v_is_already_active and v_existing_active_hash is distinct from in_configuration_hash then
    raise exception using errcode = 'P0001', message = 'configuration_hash_mismatch';
  end if;

  select * into v_existing_sched
  from public.scheduled_jobs
  where job_key = v_job_key;

  if found then
    v_sched_next := v_existing_sched.next_run_at;
  else
    v_next_hour := date_trunc('hour', v_now) + interval '1 hour';
    v_sched_next := v_next_hour;
  end if;

  insert into public.scheduled_jobs(
    job_key, job_name, cron_expression, timezone, route_path, is_active,
    next_run_at, last_run_at, created_at, updated_at
  ) values (
    v_job_key, v_job_name, v_cron_expression, v_timezone, v_route_path, true,
    v_sched_next, null, v_now, v_now
  ) on conflict (job_key) do update set
    job_name = excluded.job_name,
    cron_expression = excluded.cron_expression,
    timezone = excluded.timezone,
    route_path = excluded.route_path,
    is_active = true,
    next_run_at = coalesce(public.scheduled_jobs.next_run_at, excluded.next_run_at),
    updated_at = excluded.updated_at;

  v_next_midnight := date_trunc('day', v_now) + interval '1 day';

  update public.internal_orchestration_jobs_v1
    set enabled = true,
        timezone = 'UTC',
        updated_at = v_now,
        next_run_at = coalesce(next_run_at, case
          when job_name in ('external-source-watchdog-v1', 'milestone-horizon-scan-v1') then v_next_midnight
          else v_sched_next
        end)
  where environment = 'production'
    and job_name in (
      'external-source-watchdog-v1',
      'milestone-horizon-scan-v1',
      'expired-lease-recovery-v1',
      'expired-milestone-alert-cleanup-v1'
    );

  select count(*) into v_enabled_approved_jobs
  from public.internal_orchestration_jobs_v1
  where environment = 'production'
    and enabled = true
    and job_name in (
      'external-source-watchdog-v1',
      'milestone-horizon-scan-v1',
      'expired-lease-recovery-v1',
      'expired-milestone-alert-cleanup-v1'
    );

  if v_enabled_approved_jobs <> 4 then
    raise exception using errcode = 'P0001', message = 'approved_internal_jobs_missing';
  end if;

  insert into public.system_state(key, value_json, updated_at)
  values (
    v_state_key,
    jsonb_build_object(
      'active', true,
      'configuration_version', in_configuration_version,
      'configuration_hash', in_configuration_hash,
      'environment', in_environment,
      'governing_policy_reference', in_governing_policy_reference,
      'review_by', in_review_by,
      'updated_at', v_now
    ),
    v_now
  ) on conflict (key) do update set
    value_json = excluded.value_json,
    updated_at = excluded.updated_at;

  v_post := jsonb_build_object(
    'scheduled_job', (
      select to_jsonb(s) from (
        select job_key, cron_expression, timezone, route_path, is_active, next_run_at, last_run_at
        from public.scheduled_jobs where job_key=v_job_key
      ) s
    ),
    'internal_jobs', (
      select jsonb_agg(to_jsonb(j) order by j.job_name) from (
        select job_name, enabled, cadence_type, cadence_minutes, timezone, next_run_at, last_success_at, last_failure_at
        from public.internal_orchestration_jobs_v1
        where environment='production'
          and job_name in (
            'external-source-watchdog-v1',
            'milestone-horizon-scan-v1',
            'expired-lease-recovery-v1',
            'expired-milestone-alert-cleanup-v1'
          )
      ) j
    )
  );

  update public.system_state
    set value_json = jsonb_build_object(
      'type', 'activation',
      'status', 'succeeded',
      'activation_id', in_activation_id,
      'configuration_version', in_configuration_version,
      'configuration_hash', in_configuration_hash,
      'environment', in_environment,
      'requested_by', in_requested_by,
      'requested_at', in_requested_at,
      'review_by', in_review_by,
      'governing_policy_reference', in_governing_policy_reference,
      'expected_project_ref', in_expected_project_ref,
      'pre', v_pre,
      'post', v_post,
      'completed_at', v_now
    ),
        updated_at = v_now
  where key = v_audit_key;

  activation_id := in_activation_id;
  configuration_hash := in_configuration_hash;
  created_new_activation := not v_is_already_active;
  idempotent_replay := v_is_already_active;
  result_code := case when v_is_already_active then 'idempotent_replay' else 'activated' end;
  heartbeat_row := (v_post->'scheduled_job');
  internal_jobs := (v_post->'internal_jobs');
  safety_snapshot := v_pre;
  audit_state_key := v_audit_key;
  return next;
end;
$fn$;

create or replace function public.disable_external_intelligence_internal_orchestration_v1(
  in_disable_id text,
  in_configuration_version text,
  in_configuration_hash text,
  in_environment text,
  in_requested_by text,
  in_requested_at timestamptz,
  in_review_by text,
  in_governing_policy_reference text,
  in_expected_project_ref text
)
returns table (
  disable_id text,
  configuration_hash text,
  created_new_disable boolean,
  idempotent_replay boolean,
  result_code text,
  heartbeat_row jsonb,
  internal_jobs jsonb,
  safety_snapshot jsonb,
  audit_state_key text,
  active_lease_present boolean
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now timestamptz := timezone('utc', now());
  v_expected_project_ref constant text := 'ibjsjosplgbqevmnvvpf';

  v_job_key constant text := 'external-intelligence-heartbeat';
  v_disable_key text;
  v_state_key constant text := 'external_intelligence_recurring_internal_orchestration_state_v1';

  v_active_lease_count integer := 0;
  v_enabled_external_schedules integer := 0;
  v_active_external_jobs integer := 0;
  v_unknown_enabled_jobs integer := 0;
  v_pre jsonb;
  v_post jsonb;
  v_state record;
  v_is_active boolean := false;
begin
  if session_user is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  if coalesce(nullif(in_disable_id, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_disable_id';
  end if;
  if coalesce(nullif(in_configuration_version, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_configuration_version';
  end if;
  if coalesce(nullif(in_configuration_hash, ''), '') = '' then
    raise exception using errcode = '22023', message = 'invalid_configuration_hash';
  end if;
  if in_environment is distinct from 'production' then
    raise exception using errcode = '22023', message = 'invalid_environment';
  end if;
  if in_expected_project_ref is distinct from v_expected_project_ref then
    raise exception using errcode = 'P0001', message = 'project_ref_mismatch';
  end if;

  v_disable_key := 'external_intelligence_recurring_disable_v1:' || in_disable_id;
  insert into public.system_state(key, value_json, updated_at)
  values (v_disable_key, jsonb_build_object('status', 'claimed', 'claimed_at', v_now), v_now)
  on conflict (key) do nothing;
  if not found then
    raise exception using errcode = 'P0001', message = 'disable_already_claimed';
  end if;

  select count(*) into v_active_lease_count
  from public.internal_orchestration_locks_v1
  where lock_key = v_job_key
    and expires_at is not null
    and expires_at > v_now;

  select count(*) into v_enabled_external_schedules
  from public.external_collection_schedules_v1
  where enabled = true
    and environment = 'production';

  select (
    (select count(*) from public.external_collection_jobs_v1 where status in ('queued','leased','running'))
    +
    (select count(*) from public.external_collection_jobs_v1
      where status = 'retry_wait'
        and (next_retry_at is null or next_retry_at <= v_now)
    )
  ) into v_active_external_jobs;

  select count(*) into v_unknown_enabled_jobs
  from public.internal_orchestration_jobs_v1
  where environment = 'production'
    and enabled = true
    and job_name not in (
      'external-source-watchdog-v1',
      'milestone-horizon-scan-v1',
      'expired-lease-recovery-v1',
      'expired-milestone-alert-cleanup-v1'
    );
  if v_unknown_enabled_jobs <> 0 then
    raise exception using errcode = 'P0001', message = 'unknown_internal_job_enabled';
  end if;

  v_pre := jsonb_build_object(
    'now', v_now,
    'active_heartbeat_leases', v_active_lease_count,
    'enabled_external_schedules', v_enabled_external_schedules,
    'active_external_jobs', v_active_external_jobs,
    'unknown_enabled_internal_jobs', v_unknown_enabled_jobs
  );

  select value_json into v_state
  from public.system_state
  where key = v_state_key;
  if v_state is not null then
    v_is_active := (v_state.value_json->>'active')::boolean;
  end if;

  update public.scheduled_jobs
    set is_active = false,
        updated_at = v_now
  where job_key = v_job_key;

  update public.internal_orchestration_jobs_v1
    set enabled = false,
        updated_at = v_now
  where environment = 'production'
    and job_name in (
      'external-source-watchdog-v1',
      'milestone-horizon-scan-v1',
      'expired-lease-recovery-v1',
      'expired-milestone-alert-cleanup-v1'
    );

  insert into public.system_state(key, value_json, updated_at)
  values (
    v_state_key,
    jsonb_build_object(
      'active', false,
      'configuration_version', in_configuration_version,
      'configuration_hash', in_configuration_hash,
      'environment', in_environment,
      'governing_policy_reference', in_governing_policy_reference,
      'review_by', in_review_by,
      'updated_at', v_now
    ),
    v_now
  ) on conflict (key) do update set
    value_json = excluded.value_json,
    updated_at = excluded.updated_at;

  v_post := jsonb_build_object(
    'scheduled_job', (
      select to_jsonb(s) from (
        select job_key, cron_expression, timezone, route_path, is_active, next_run_at, last_run_at
        from public.scheduled_jobs where job_key=v_job_key
      ) s
    ),
    'internal_jobs', (
      select jsonb_agg(to_jsonb(j) order by j.job_name) from (
        select job_name, enabled, cadence_type, cadence_minutes, timezone, next_run_at, last_success_at, last_failure_at
        from public.internal_orchestration_jobs_v1
        where environment='production'
          and job_name in (
            'external-source-watchdog-v1',
            'milestone-horizon-scan-v1',
            'expired-lease-recovery-v1',
            'expired-milestone-alert-cleanup-v1'
          )
      ) j
    )
  );

  update public.system_state
    set value_json = jsonb_build_object(
      'type', 'disable',
      'status', 'succeeded',
      'disable_id', in_disable_id,
      'configuration_version', in_configuration_version,
      'configuration_hash', in_configuration_hash,
      'environment', in_environment,
      'requested_by', in_requested_by,
      'requested_at', in_requested_at,
      'review_by', in_review_by,
      'governing_policy_reference', in_governing_policy_reference,
      'expected_project_ref', in_expected_project_ref,
      'pre', v_pre,
      'post', v_post,
      'completed_at', v_now
    ),
        updated_at = v_now
  where key = v_disable_key;

  disable_id := in_disable_id;
  configuration_hash := in_configuration_hash;
  created_new_disable := v_is_active;
  idempotent_replay := not v_is_active;
  result_code := case when v_is_active then 'disabled' else 'idempotent_replay' end;
  heartbeat_row := (v_post->'scheduled_job');
  internal_jobs := (v_post->'internal_jobs');
  safety_snapshot := v_pre;
  audit_state_key := v_disable_key;
  active_lease_present := (v_active_lease_count <> 0);
  return next;
end;
$fn$;

revoke all on function public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from public;
revoke all on function public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from anon;
revoke all on function public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from authenticated;

grant execute on function public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) to service_role;
grant execute on function public.activate_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) to postgres;

revoke all on function public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from public;
revoke all on function public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from anon;
revoke all on function public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) from authenticated;

grant execute on function public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) to service_role;
grant execute on function public.disable_external_intelligence_internal_orchestration_v1(
  text,text,text,text,text,timestamptz,text,text,text
) to postgres;

commit;

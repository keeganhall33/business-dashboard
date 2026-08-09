-- SportsPro RSS schedule seed.
-- Additive, rerunnable. Disabled-by-default.

begin;

insert into public.external_collection_schedules_v1(
  schedule_id,
  source_id,
  source_config_version,
  registry_hash,
  source_sets_hash,
  eligibility_fingerprint,
  schedule_policy_version,
  cadence_type,
  cadence_interval_seconds,
  timezone,
  preferred_window_json,
  freshness_sla_seconds,
  maximum_staleness_seconds,
  timeout_seconds,
  maximum_attempts,
  backoff_policy_json,
  rate_limit_budget_json,
  concurrency_key,
  priority,
  enabled,
  collection_mode,
  environment,
  review_by
) values (
  'sports_business.sportspro:production',
  'sports_business.sportspro',
  'v1',
  repeat('0',64),
  repeat('0',64),
  repeat('0',64),
  'sportspro.rss.hourly.v1',
  'hourly',
  3600,
  'UTC',
  jsonb_build_object('max_items_per_run', 5, 'feed_url', 'https://www.sportspro.com/feed/'),
  86400,
  604800,
  20,
  3,
  '{}'::jsonb,
  '{}'::jsonb,
  'sports_business:sportspro',
  'low',
  false,
  'automated',
  'production',
  'legal'
) on conflict (schedule_id) do nothing;

commit;

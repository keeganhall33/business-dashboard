-- Migration: Meta historical foundation (Phase 1B.2)
-- NOTE: Do not apply until Phase 1B.2 sample run is approved.

BEGIN;

CREATE TABLE IF NOT EXISTS meta_ingestion_runs (
  run_id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'LIVE', 'PARTIAL', 'FAILED')),
  requested_api_version TEXT,
  returned_api_version TEXT,
  account_id TEXT,
  account_timezone TEXT,
  account_currency TEXT,
  date_start DATE,
  date_end DATE,
  attribution_setting TEXT,
  row_counts JSONB DEFAULT '{}'::JSONB,
  api_call_counts JSONB DEFAULT '{}'::JSONB,
  usage_headers JSONB DEFAULT '{}'::JSONB,
  warnings JSONB DEFAULT '[]'::JSONB,
  error_summary TEXT,
  source_commit TEXT,
  payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ingestion_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_ingestion_runs FROM anon;
REVOKE ALL ON TABLE public.meta_ingestion_runs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_ingestion_runs TO service_role;


CREATE INDEX IF NOT EXISTS meta_ingestion_runs_status_started_idx ON meta_ingestion_runs (status, started_at DESC);

CREATE TABLE IF NOT EXISTS meta_account_daily (
  account_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  attribution_setting TEXT NOT NULL,
  account_timezone TEXT,
  currency TEXT,
  spend NUMERIC(18,4) CHECK (spend >= 0),
  impressions BIGINT CHECK (impressions >= 0),
  reach BIGINT CHECK (reach >= 0),
  frequency NUMERIC(12,6),
  clicks BIGINT CHECK (clicks >= 0),
  ctr NUMERIC(12,6),
  cpc NUMERIC(18,6),
  cpm NUMERIC(18,6),
  landing_page_views BIGINT CHECK (landing_page_views >= 0),
  add_to_cart BIGINT CHECK (add_to_cart >= 0),
  initiate_checkout BIGINT CHECK (initiate_checkout >= 0),
  purchases BIGINT CHECK (purchases >= 0),
  purchase_value NUMERIC(18,4) CHECK (purchase_value >= 0),
  roas NUMERIC(18,6),
  video_views BIGINT CHECK (video_views >= 0),
  metrics_meta JSONB DEFAULT '{}'::JSONB,
  raw_actions JSONB DEFAULT '[]'::JSONB,
  raw_action_values JSONB DEFAULT '[]'::JSONB,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  warnings JSONB DEFAULT '[]'::JSONB,
  PRIMARY KEY (account_id, metric_date, attribution_setting)
);

ALTER TABLE public.meta_account_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_account_daily FROM anon;
REVOKE ALL ON TABLE public.meta_account_daily FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_account_daily TO service_role;


CREATE INDEX IF NOT EXISTS meta_account_daily_metric_date_idx ON meta_account_daily (metric_date);
CREATE INDEX IF NOT EXISTS meta_account_daily_source_run_idx ON meta_account_daily (source_run_id);

CREATE TABLE IF NOT EXISTS meta_campaign_daily (
  account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  attribution_setting TEXT NOT NULL,
  campaign_name TEXT,
  objective TEXT,
  buying_type TEXT,
  effective_status TEXT,
  daily_budget NUMERIC(18,4) CHECK (daily_budget >= 0),
  lifetime_budget NUMERIC(18,4) CHECK (lifetime_budget >= 0),
  spend NUMERIC(18,4) CHECK (spend >= 0),
  impressions BIGINT CHECK (impressions >= 0),
  reach BIGINT CHECK (reach >= 0),
  frequency NUMERIC(12,6),
  clicks BIGINT CHECK (clicks >= 0),
  ctr NUMERIC(12,6),
  cpc NUMERIC(18,6),
  cpm NUMERIC(18,6),
  landing_page_views BIGINT CHECK (landing_page_views >= 0),
  add_to_cart BIGINT CHECK (add_to_cart >= 0),
  initiate_checkout BIGINT CHECK (initiate_checkout >= 0),
  purchases BIGINT CHECK (purchases >= 0),
  purchase_value NUMERIC(18,4) CHECK (purchase_value >= 0),
  roas NUMERIC(18,6),
  video_views BIGINT CHECK (video_views >= 0),
  metrics_meta JSONB DEFAULT '{}'::JSONB,
  raw_actions JSONB DEFAULT '[]'::JSONB,
  raw_action_values JSONB DEFAULT '[]'::JSONB,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  warnings JSONB DEFAULT '[]'::JSONB,
  PRIMARY KEY (account_id, campaign_id, metric_date, attribution_setting)
);

ALTER TABLE public.meta_campaign_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_campaign_daily FROM anon;
REVOKE ALL ON TABLE public.meta_campaign_daily FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_campaign_daily TO service_role;


CREATE INDEX IF NOT EXISTS meta_campaign_daily_metric_date_idx ON meta_campaign_daily (metric_date);
CREATE INDEX IF NOT EXISTS meta_campaign_daily_campaign_idx ON meta_campaign_daily (campaign_id);
CREATE INDEX IF NOT EXISTS meta_campaign_daily_source_run_idx ON meta_campaign_daily (source_run_id);

CREATE TABLE IF NOT EXISTS meta_adset_daily (
  account_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  attribution_setting TEXT NOT NULL,
  campaign_id TEXT,
  adset_name TEXT,
  effective_status TEXT,
  optimization_goal TEXT,
  billing_event TEXT,
  bid_strategy TEXT,
  daily_budget NUMERIC(18,4) CHECK (daily_budget >= 0),
  lifetime_budget NUMERIC(18,4) CHECK (lifetime_budget >= 0),
  promoted_object JSONB,
  targeting_summary JSONB,
  spend NUMERIC(18,4) CHECK (spend >= 0),
  impressions BIGINT CHECK (impressions >= 0),
  reach BIGINT CHECK (reach >= 0),
  frequency NUMERIC(12,6),
  clicks BIGINT CHECK (clicks >= 0),
  ctr NUMERIC(12,6),
  cpc NUMERIC(18,6),
  cpm NUMERIC(18,6),
  landing_page_views BIGINT CHECK (landing_page_views >= 0),
  add_to_cart BIGINT CHECK (add_to_cart >= 0),
  initiate_checkout BIGINT CHECK (initiate_checkout >= 0),
  purchases BIGINT CHECK (purchases >= 0),
  purchase_value NUMERIC(18,4) CHECK (purchase_value >= 0),
  roas NUMERIC(18,6),
  video_views BIGINT CHECK (video_views >= 0),
  metrics_meta JSONB DEFAULT '{}'::JSONB,
  raw_actions JSONB DEFAULT '[]'::JSONB,
  raw_action_values JSONB DEFAULT '[]'::JSONB,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  warnings JSONB DEFAULT '[]'::JSONB,
  PRIMARY KEY (account_id, adset_id, metric_date, attribution_setting)
);

ALTER TABLE public.meta_adset_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_adset_daily FROM anon;
REVOKE ALL ON TABLE public.meta_adset_daily FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_adset_daily TO service_role;


CREATE INDEX IF NOT EXISTS meta_adset_daily_metric_date_idx ON meta_adset_daily (metric_date);
CREATE INDEX IF NOT EXISTS meta_adset_daily_adset_idx ON meta_adset_daily (adset_id);
CREATE INDEX IF NOT EXISTS meta_adset_daily_campaign_idx ON meta_adset_daily (campaign_id);
CREATE INDEX IF NOT EXISTS meta_adset_daily_source_run_idx ON meta_adset_daily (source_run_id);

CREATE TABLE IF NOT EXISTS meta_ad_daily (
  account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  attribution_setting TEXT NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_name TEXT,
  creative_id TEXT,
  effective_status TEXT,
  spend NUMERIC(18,4) CHECK (spend >= 0),
  impressions BIGINT CHECK (impressions >= 0),
  reach BIGINT CHECK (reach >= 0),
  frequency NUMERIC(12,6),
  clicks BIGINT CHECK (clicks >= 0),
  inline_link_clicks BIGINT CHECK (inline_link_clicks >= 0),
  outbound_clicks BIGINT CHECK (outbound_clicks >= 0),
  landing_page_views BIGINT CHECK (landing_page_views >= 0),
  ctr NUMERIC(12,6),
  cpc NUMERIC(18,6),
  cpm NUMERIC(18,6),
  add_to_cart BIGINT CHECK (add_to_cart >= 0),
  initiate_checkout BIGINT CHECK (initiate_checkout >= 0),
  purchases BIGINT CHECK (purchases >= 0),
  purchase_value NUMERIC(18,4) CHECK (purchase_value >= 0),
  roas NUMERIC(18,6),
  video_views BIGINT CHECK (video_views >= 0),
  metrics_meta JSONB DEFAULT '{}'::JSONB,
  raw_actions JSONB DEFAULT '[]'::JSONB,
  raw_action_values JSONB DEFAULT '[]'::JSONB,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  warnings JSONB DEFAULT '[]'::JSONB,
  PRIMARY KEY (account_id, ad_id, metric_date, attribution_setting)
);

ALTER TABLE public.meta_ad_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_ad_daily FROM anon;
REVOKE ALL ON TABLE public.meta_ad_daily FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_ad_daily TO service_role;


CREATE INDEX IF NOT EXISTS meta_ad_daily_metric_date_idx ON meta_ad_daily (metric_date);
CREATE INDEX IF NOT EXISTS meta_ad_daily_ad_idx ON meta_ad_daily (ad_id);
CREATE INDEX IF NOT EXISTS meta_ad_daily_adset_idx ON meta_ad_daily (adset_id);
CREATE INDEX IF NOT EXISTS meta_ad_daily_campaign_idx ON meta_ad_daily (campaign_id);
CREATE INDEX IF NOT EXISTS meta_ad_daily_source_run_idx ON meta_ad_daily (source_run_id);

CREATE TABLE IF NOT EXISTS meta_creatives (
  creative_id TEXT PRIMARY KEY,
  creative_name TEXT,
  object_story_id TEXT,
  effective_object_story_id TEXT,
  format TEXT,
  call_to_action_type TEXT,
  destination_domain TEXT,
  destination_path TEXT,
  image_hash TEXT,
  video_id TEXT,
  thumbnail_url TEXT,
  image_url TEXT,
  facebook_page_id TEXT,
  instagram_actor_id TEXT,
  is_carousel BOOLEAN,
  is_dynamic BOOLEAN,
  is_catalog BOOLEAN,
  asset_url_ephemeral BOOLEAN,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  current_content_hash TEXT,
  metadata JSONB DEFAULT '{}'::JSONB
);

ALTER TABLE public.meta_creatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_creatives FROM anon;
REVOKE ALL ON TABLE public.meta_creatives FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_creatives TO service_role;


CREATE INDEX IF NOT EXISTS meta_creatives_last_seen_idx ON meta_creatives (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS meta_creative_versions (
  creative_id TEXT NOT NULL REFERENCES meta_creatives(creative_id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  primary_text TEXT,
  headline TEXT,
  description TEXT,
  call_to_action_type TEXT,
  destination_domain TEXT,
  destination_path TEXT,
  object_story_spec JSONB,
  asset_feed_spec JSONB,
  carousel_cards JSONB,
  asset_metadata JSONB,
  captured_at TIMESTAMPTZ NOT NULL,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  PRIMARY KEY (creative_id, content_hash)
);

ALTER TABLE public.meta_creative_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_creative_versions FROM anon;
REVOKE ALL ON TABLE public.meta_creative_versions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_creative_versions TO service_role;


CREATE INDEX IF NOT EXISTS meta_creative_versions_captured_idx ON meta_creative_versions (captured_at DESC);

CREATE TABLE IF NOT EXISTS meta_ad_creative_map (
  ad_id TEXT NOT NULL,
  creative_id TEXT NOT NULL REFERENCES meta_creatives(creative_id) ON DELETE CASCADE,
  campaign_id TEXT,
  adset_id TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  source_run_id UUID REFERENCES meta_ingestion_runs(run_id) ON DELETE SET NULL,
  PRIMARY KEY (ad_id, creative_id)
);

ALTER TABLE public.meta_ad_creative_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meta_ad_creative_map FROM anon;
REVOKE ALL ON TABLE public.meta_ad_creative_map FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meta_ad_creative_map TO service_role;


CREATE INDEX IF NOT EXISTS meta_ad_creative_map_ad_idx ON meta_ad_creative_map (ad_id);
CREATE INDEX IF NOT EXISTS meta_ad_creative_map_creative_idx ON meta_ad_creative_map (creative_id);

COMMIT;

BEGIN;

DROP TABLE IF EXISTS meta_ad_creative_map;
DROP TABLE IF EXISTS meta_creative_versions;
DROP TABLE IF EXISTS meta_creatives;
DROP TABLE IF EXISTS meta_ad_daily;
DROP TABLE IF EXISTS meta_adset_daily;
DROP TABLE IF EXISTS meta_campaign_daily;
DROP TABLE IF EXISTS meta_account_daily;
DROP TABLE IF EXISTS meta_ingestion_runs;

COMMIT;

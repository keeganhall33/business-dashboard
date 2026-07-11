import type { SupabaseClient } from "@supabase/supabase-js";

export type MetaAction = {
  action_type?: string | null;
  value?: string | number | null;
  inline_value?: string | number | null;
  action_value?: string | number | null;
  "1d_view"?: string | number | null;
  "7d_click"?: string | number | null;
};

export type NormalizedActionMetricKey =
  | "purchases"
  | "purchase_value"
  | "add_to_cart"
  | "initiate_checkout"
  | "landing_page_views"
  | "video_views";

export type NormalizedActionMetrics = {
  semanticsVersion: "meta-actions-v1";
  values: Record<NormalizedActionMetricKey, number | null>;
  aliasMap: Record<NormalizedActionMetricKey, string | null>;
  conflicts: Array<{
    metric: NormalizedActionMetricKey;
    aliases: [string, string];
    values: [number, number];
  }>;
  warnings: string[];
};

export type NormalizedCreativeContent = {
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  callToActionType: string | null;
  destinationDomain: string | null;
  destinationPath: string | null;
  imageHash: string | null;
  videoId: string | null;
  carouselCards: Array<Record<string, unknown>> | null;
  dynamicMetadata: Record<string, unknown> | null;
  instagramActorId: string | null;
  facebookPageId: string | null;
  format: string | null;
  templateUrl: string | null;
  isCatalog: boolean;
  isDynamic: boolean;
};

export type NormalizedCreative = {
  creativeId: string;
  creativeName: string | null;
  objectStoryId: string | null;
  effectiveObjectStoryId: string | null;
  format: string | null;
  callToActionType: string | null;
  destinationDomain: string | null;
  destinationPath: string | null;
  imageHash: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  facebookPageId: string | null;
  instagramActorId: string | null;
  isCarousel: boolean;
  isDynamic: boolean;
  isCatalog: boolean;
  assetUrlEphemeral: boolean;
  normalizedContent: NormalizedCreativeContent;
  contentHash: string;
  metadata: Record<string, unknown>;
  warnings: string[];
};

export type NormalizedCreativeVersion = {
  creative_id: string;
  content_hash: string;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  call_to_action_type: string | null;
  destination_domain: string | null;
  destination_path: string | null;
  object_story_spec: Record<string, unknown> | null;
  asset_feed_spec: Record<string, unknown> | null;
  carousel_cards: unknown[] | null;
  asset_metadata: Record<string, unknown> | null;
  captured_at: string;
  source_run_id: string | null;
};

export type CreativeIdentityRow = {
  creative_id: string;
  creative_name: string | null;
  object_story_id: string | null;
  effective_object_story_id: string | null;
  format: string | null;
  call_to_action_type: string | null;
  destination_domain: string | null;
  destination_path: string | null;
  image_hash: string | null;
  video_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  facebook_page_id: string | null;
  instagram_actor_id: string | null;
  is_carousel: boolean;
  is_dynamic: boolean;
  is_catalog: boolean;
  asset_url_ephemeral: boolean;
  first_seen_at: string;
  last_seen_at: string;
  current_content_hash: string;
  metadata: Record<string, unknown>;
};

export type AdCreativeMapRow = {
  ad_id: string;
  creative_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_run_id: string | null;
};

export type IngestionRange = {
  since: string;
  until: string;
  days: number;
  label: string;
  source: "default" | "explicit";
};

export type MetaAccountContext = {
  accountId: string;
  timezoneName: string | null;
  currency: string | null;
  name: string | null;
  attributionSetting: string | null;
  defaultAttributionLabel: string;
};

export type MetaHistoryOptions = {
  accessToken: string;
  configuredAccountId?: string;
  since?: string;
  until?: string;
  maxPages?: number;
  maxRetries?: number;
  supabaseClient?: SupabaseClient;
  sourceCommit?: string | null;
};

export type NormalizedInsightRow = {
  table: "meta_account_daily" | "meta_campaign_daily" | "meta_adset_daily" | "meta_ad_daily";
  data: Record<string, unknown>;
};

export type GraphUsageSnapshot = {
  adAccountUsage?: Record<string, unknown> | null;
  appUsage?: Record<string, unknown> | null;
  businessUsage?: Record<string, unknown> | null;
  throttleEvents: Array<{ endpoint: string; status: number; message: string }>;
};

export type GraphRequestCounters = Record<string, number>;

export type MetaHistorySummary = {
  runId: string;
  status: "LIVE" | "PARTIAL" | "FAILED";
  startedAt: string;
  completedAt: string;
  account: MetaAccountContext;
  range: IngestionRange;
  rowCounts: Record<string, number>;
  warnings: string[];
  payloadHash: string;
  usage: GraphUsageSnapshot;
};

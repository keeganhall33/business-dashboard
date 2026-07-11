import crypto from "node:crypto";
import { GraphClient } from "./graph-client.ts";
import { computeIngestionRange } from "./date-range.ts";
import { normalizeMetaActions } from "./action-normalization.ts";
import { normalizeCreative } from "./creative-normalization.ts";
import { MetaSupabaseWriter } from "./supabase-writer.ts";
import type {
  MetaHistoryOptions,
  MetaHistorySummary,
  MetaAccountContext,
  NormalizedActionMetrics,
  NormalizedCreative,
  NormalizedCreativeVersion,
  CreativeIdentityRow,
  AdCreativeMapRow,
  MetaAction,
  MetaWriter,
  GraphClientLike,
  GraphUsageSnapshot
} from "./types.ts";

type InsightLevel = "account" | "campaign" | "adset" | "ad";

const REQUESTED_API_VERSION = "v25.0";
const REQUESTED_ATTR_LABEL = "7d_click_1d_view";

export async function runMetaHistoryIngestion(options: MetaHistoryOptions): Promise<MetaHistorySummary> {
  const startedAt = new Date().toISOString();
  const referenceDate = options.referenceDate ?? new Date();
  const range = computeIngestionRange({ since: options.since, until: options.until, defaultDays: 3 }, referenceDate);
  const runId = crypto.randomUUID();

  const graphClient: GraphClientLike =
    options.graphClientFactory?.() ??
    new GraphClient({
      accessToken: options.accessToken,
      apiVersion: REQUESTED_API_VERSION,
      maxPages: options.maxPages,
      maxRetries: options.maxRetries,
      logger: (message) => console.warn(message)
    });

  const writer: MetaWriter | null =
    options.writer ?? (options.supabaseClient ? new MetaSupabaseWriter(options.supabaseClient) : null);

  if (writer) {
    await writer.createRun(runId, {
      startedAt,
      requestedVersion: REQUESTED_API_VERSION,
      sourceCommit: options.sourceCommit ?? null
    });
  }

  const warnings: string[] = [];
  let finalStatus: "LIVE" | "PARTIAL" | "FAILED" = "FAILED";
  let errorSummary: string | null = null;
  let summary: MetaHistorySummary | null = null;
  let accountContext: MetaAccountContext | null = null;
  let normalizedRows = emptyNormalizedRows();
  let creativePayload = emptyCreativePayload();
  let rowCounts = emptyRowCounts();
  let payloadHash = "";
  let usageSnapshot: GraphUsageSnapshot = { throttleEvents: [] };
  const nowIso = new Date().toISOString();

  try {
    accountContext = await resolveAccountContext(graphClient, options.configuredAccountId);
    const levelData = await fetchRequiredInsights({
      graphClient,
      accountId: accountContext.accountId,
      range
    });

    const creativeResult = await buildCreativePayloadSafe({
      graphClient,
      accountId: accountContext.accountId,
      runId,
      writer,
      nowIso,
      warnings
    });

    creativePayload = creativeResult.payload;
    normalizedRows = buildNormalizedRows({
      levelData,
      accountContext,
      runId,
      nowIso,
      warnings
    });

    rowCounts = computeRowCounts(normalizedRows, creativePayload);
    payloadHash = computePayloadHash(normalizedRows, creativePayload);

    if (writer) {
      await performSupabaseWrites({ writer, normalizedRows, creativePayload });
    }

    finalStatus = creativeResult.failed ? "PARTIAL" : "LIVE";
    warnings.push(...graphClient.getVersionWarnings());
    usageSnapshot = graphClient.getUsageSnapshot();

    summary = {
      runId,
      status: finalStatus,
      startedAt,
      completedAt: nowIso,
      account: accountContext,
      range,
      rowCounts,
      warnings,
      payloadHash,
      usage: usageSnapshot
    };

    return summary;
  } catch (error) {
    errorSummary = sanitizeErrorMessage(error);
    warnings.push(errorSummary);
    throw error;
  } finally {
    usageSnapshot = usageSnapshot || graphClient.getUsageSnapshot();
    const completedAt = new Date().toISOString();
    if (writer) {
      try {
        await writer.finalizeRun(runId, {
          status: summary ? finalStatus : "FAILED",
          completedAt,
          accountId: accountContext?.accountId ?? null,
          accountTimezone: accountContext?.timezoneName ?? null,
          accountCurrency: accountContext?.currency ?? null,
          dateStart: range.since,
          dateEnd: range.until,
          attributionSetting: accountContext?.defaultAttributionLabel ?? REQUESTED_ATTR_LABEL,
          rowCounts,
          apiCallCounts: graphClient.getRequestCounters(),
          usage: usageSnapshot,
          warnings,
          errorSummary,
          requestedVersion: REQUESTED_API_VERSION,
          returnedVersion: graphClient.getReturnedVersion(),
          payloadHash: payloadHash || ""
        });
      } catch (finalizeError) {
        console.error("[meta-history] Failed to finalize run:", finalizeError);
      }
    }
  }
}

async function resolveAccountContext(graphClient: GraphClientLike, configuredId?: string): Promise<MetaAccountContext> {
  const accountId = await resolveAccountId(graphClient, configuredId);
  const fields = [
    "id",
    "name",
    "currency",
    "timezone_name",
    "account_id",
    "attribution_spec"
  ];
  const json = await graphClient.get(`act_${accountId}`, { fields: fields.join(",") }, { label: "ad_account" });
  const accountPayload = asRecord(json) ?? {};
  const attributionLabel = formatAttributionSpec(accountPayload["attribution_spec"]) ?? "account_default";
  return {
    accountId,
    timezoneName: asString(accountPayload["timezone_name"]),
    currency: asString(accountPayload["currency"]),
    name: asString(accountPayload["name"]),
    attributionSetting: attributionLabel,
    defaultAttributionLabel: attributionLabel
  };
}

async function resolveAccountId(graphClient: GraphClientLike, configuredId?: string): Promise<string> {
  if (configuredId && configuredId.trim()) {
    return stripActPrefix(configuredId.trim());
  }
  const json = await graphClient.get("me/adaccounts", { fields: "id,name", limit: 1 }, { label: "adaccounts" });
  const payload = asRecord(json);
  const accounts = payload && Array.isArray(payload.data) ? payload.data : [];
  for (const entry of accounts) {
    const record = asRecord(entry);
    if (!record) continue;
    const detected = asString(record["id"]) ?? asString(record["account_id"]);
    if (detected) {
      return stripActPrefix(detected);
    }
  }
  throw new Error("No Meta ad accounts available for the provided token");
}

function stripActPrefix(value: string): string {
  return value.replace(/^act_/, "");
}

function insightFieldsFor(level: InsightLevel): string {
  const common = [
    "account_id",
    "date_start",
    "date_stop",
    "attribution_setting",
    "spend",
    "impressions",
    "reach",
    "frequency",
    "clicks",
    "ctr",
    "cpc",
    "cpm",
    "inline_link_clicks",
    "outbound_clicks",
    "landing_page_views",
    "actions",
    "action_values",
    "video_plays",
    "video_15_sec_watched_actions"
  ];

  if (level === "campaign") {
    common.push(
      "campaign_id",
      "campaign_name",
      "objective",
      "buying_type",
      "daily_budget",
      "lifetime_budget",
      "effective_status"
    );
  }
  if (level === "adset") {
    common.push(
      "campaign_id",
      "adset_id",
      "adset_name",
      "effective_status",
      "optimization_goal",
      "billing_event",
      "bid_strategy",
      "promoted_object",
      "targeting"
    );
  }
  if (level === "ad") {
    common.push(
      "campaign_id",
      "adset_id",
      "ad_id",
      "ad_name",
      "creative_id",
      "effective_status",
      "inline_link_click_ctr"
    );
  }

  return common.join(",");
}

function buildNormalizedRows(params: {
  levelData: Record<InsightLevel, Record<string, unknown>[]>;
  accountContext: MetaAccountContext;
  runId: string;
  nowIso: string;
  warnings: string[];
}) {
  return {
    account: normalizeLevel("account", params.levelData.account, params),
    campaign: normalizeLevel("campaign", params.levelData.campaign, params),
    adset: normalizeLevel("adset", params.levelData.adset, params),
    ad: normalizeLevel("ad", params.levelData.ad, params)
  } as const;
}

function normalizeLevel(
  level: InsightLevel,
  rows: Array<Record<string, unknown>>,
  context: {
    accountContext: MetaAccountContext;
    runId: string;
    nowIso: string;
    warnings: string[];
  }
) {
  const output: Record<string, unknown>[] = [];
  for (const row of rows ?? []) {
    const normalized = normalizeInsightRow(level, row, context);
    if (normalized) output.push(normalized);
  }
  return output;
}

function normalizeInsightRow(
  level: InsightLevel,
  row: Record<string, unknown>,
  context: {
    accountContext: MetaAccountContext;
    runId: string;
    nowIso: string;
    warnings: string[];
  }
): Record<string, unknown> | null {
  const metricDate = asString(row["date_start"]) ?? asString(row["date_stop"]);
  if (!metricDate) {
    context.warnings.push(`Skipping ${level} row with missing date_start`);
    return null;
  }

  const rawActions = Array.isArray(row["actions"]) ? (row["actions"] as MetaAction[]) : [];
  const rawActionValues = Array.isArray(row["action_values"]) ? (row["action_values"] as MetaAction[]) : [];
  const actions: NormalizedActionMetrics = normalizeMetaActions(rawActions, rawActionValues);
  const attribution = resolveAttribution(
    asString(row["attribution_setting"]),
    context.accountContext.defaultAttributionLabel
  );
  const warnings = [...actions.warnings];
  if (attribution.warning) warnings.push(attribution.warning);

  const spend = parseMoney(row?.spend);
  const purchaseValue = actions.values.purchase_value;
  const roas = spend && purchaseValue !== null ? round(purchaseValue / spend, 6) : null;

  const baseMeta = {
    action_semantics_version: actions.semanticsVersion,
    action_aliases: actions.aliasMap,
    action_conflicts: actions.conflicts,
    attribution_setting_raw: row["attribution_setting"] ?? null,
    requested_attribution: REQUESTED_ATTR_LABEL,
    raw_landing_page_views: parseInteger(row["landing_page_views"]),
    raw_video_plays: parseInteger(row["video_plays"])
  };

  const accountId = asString(row["account_id"]) ?? context.accountContext.accountId;
  const baseRow = {
    account_id: accountId,
    metric_date: metricDate,
    attribution_setting: attribution.label,
    spend,
    impressions: parseInteger(row["impressions"]),
    reach: parseInteger(row["reach"]),
    frequency: parseDecimal(row["frequency"], 6),
    clicks: parseInteger(row["clicks"]),
    ctr: parseDecimal(row["ctr"], 6),
    cpc: parseDecimal(row["cpc"], 6),
    cpm: parseDecimal(row["cpm"], 6),
    landing_page_views: actions.values.landing_page_views,
    add_to_cart: actions.values.add_to_cart,
    initiate_checkout: actions.values.initiate_checkout,
    purchases: actions.values.purchases,
    purchase_value: purchaseValue,
    roas,
    video_views: actions.values.video_views,
    metrics_meta: baseMeta,
    raw_actions: rawActions,
    raw_action_values: rawActionValues,
    source_run_id: context.runId,
    last_synced_at: context.nowIso,
    warnings
  };

  if (level === "account") {
    return {
      ...baseRow,
      account_timezone: context.accountContext.timezoneName,
      currency: context.accountContext.currency
    };
  }

  if (level === "campaign") {
    const campaignId = asString(row["campaign_id"]);
    if (!campaignId) {
      context.warnings.push("Skipping campaign row missing campaign_id");
      return null;
    }
    return {
      ...baseRow,
      campaign_id: campaignId,
      campaign_name: asString(row["campaign_name"]),
      objective: asString(row["objective"]),
      buying_type: asString(row["buying_type"]),
      effective_status: asString(row["effective_status"]),
      daily_budget: parseMoney(row["daily_budget"]),
      lifetime_budget: parseMoney(row["lifetime_budget"])
    };
  }

  if (level === "adset") {
    const adsetId = asString(row["adset_id"]);
    if (!adsetId) {
      context.warnings.push("Skipping ad set row missing adset_id");
      return null;
    }
    return {
      ...baseRow,
      campaign_id: asString(row["campaign_id"]),
      adset_id: adsetId,
      adset_name: asString(row["adset_name"]),
      effective_status: asString(row["effective_status"]),
      optimization_goal: asString(row["optimization_goal"]),
      billing_event: asString(row["billing_event"]),
      bid_strategy: asString(row["bid_strategy"]),
      daily_budget: parseMoney(row["daily_budget"]),
      lifetime_budget: parseMoney(row["lifetime_budget"]),
      promoted_object: row["promoted_object"] ?? null,
      targeting_summary: row["targeting"] ?? null
    };
  }

  if (level === "ad") {
    const adId = asString(row["ad_id"]);
    if (!adId) {
      context.warnings.push("Skipping ad row missing ad_id");
      return null;
    }
    return {
      ...baseRow,
      campaign_id: asString(row["campaign_id"]),
      adset_id: asString(row["adset_id"]),
      ad_id: adId,
      ad_name: asString(row["ad_name"]),
      creative_id: asString(row["creative_id"]),
      effective_status: asString(row["effective_status"]),
      inline_link_clicks: parseInteger(row["inline_link_clicks"]),
      outbound_clicks: extractClickCount(row["outbound_clicks"])
    };
  }

  return null;
}

function resolveAttribution(rawSetting: string | null | undefined, accountDefaultLabel: string) {
  const normalized = normalizeAttributionLabel(rawSetting);
  if (normalized === REQUESTED_ATTR_LABEL) {
    return { label: REQUESTED_ATTR_LABEL };
  }
  if (!rawSetting || rawSetting === "account_default" || normalized === accountDefaultLabel) {
    return { label: "account_default" };
  }
  return {
    label: "unknown_default",
    warning: `Row attribution ${rawSetting ?? "(missing)"} did not match requested ${REQUESTED_ATTR_LABEL}`
  };
}

function normalizeAttributionLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = raw
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean)
    .sort();
  if (tokens.includes("7d_click") && tokens.includes("1d_view")) return REQUESTED_ATTR_LABEL;
  if (tokens.length === 1) return tokens[0];
  return tokens.join("_");
}

function formatAttributionSpec(spec: unknown): string | null {
  if (!Array.isArray(spec) || !spec.length) return null;
  const tokens = spec
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const eventType = asString(record["event_type"]);
      const windowValueRaw = record["window_days"];
      const windowDays = typeof windowValueRaw === "number" ? windowValueRaw : Number(windowValueRaw);
      if (eventType === "CLICK_THROUGH" && windowDays === 7) return "7d_click";
      if (eventType === "VIEW_THROUGH" && windowDays === 1) return "1d_view";
      return null;
    })
    .filter((token): token is "7d_click" | "1d_view" => token === "7d_click" || token === "1d_view");
  if (!tokens.length) return null;
  return tokens.sort().join("_");
}

function parseMoney(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 10000) / 10000;
  return rounded >= 0 ? rounded : null;
}

function parseInteger(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  return rounded >= 0 ? rounded : null;
}

function parseDecimal(value: unknown, decimals: number): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function extractClickCount(input: unknown): number | null {
  if (Array.isArray(input)) {
    let total = 0;
    for (const entry of input) {
      const value = Number(entry?.value ?? entry?.inline_value ?? entry?.clicks);
      if (Number.isFinite(value)) total += value;
    }
    return total ? Math.round(total) : null;
  }
  return parseInteger(input);
}

async function buildCreativePayload(params: {
  graphClient: GraphClientLike;
  accountId: string;
  runId: string;
  supabaseWriter: MetaWriter | null;
  nowIso: string;
  warnings: string[];
}) {
  const adsRaw = await params.graphClient.fetchCollection(`act_${params.accountId}/ads`, {
    fields: [
      "id",
      "name",
      "adset_id",
      "campaign_id",
      "effective_status",
      "creative{effective_object_story_id,object_story_id,name,call_to_action_type,object_story_spec,asset_feed_spec,template_url,template_url_spec,image_url,thumbnail_url,image_hash,body,title,description,instagram_actor_id,product_set_id,video_id,dynamic_ad_voice}"
    ].join(","),
    limit: 200
  }, { label: "ads" });
  const ads = castRecords(adsRaw);
  const creativeMap = new Map<string, NormalizedCreative>();
  const adCreativeRows: AdCreativeMapRow[] = [];
  const creativeVersions: NormalizedCreativeVersion[] = [];
  const creativeIdentities: CreativeIdentityRow[] = [];

  const creativeIds = new Set<string>();
  const adIds = new Set<string>();
  for (const ad of ads) {
    const adId = asString(ad["id"]);
    const creativeJson = asRecord(ad["creative"]);
    const creativeId = creativeJson ? asString(creativeJson["id"]) : null;
    if (creativeId) {
      creativeIds.add(creativeId);
    }
    if (adId) {
      adIds.add(adId);
    }
  }

  const existingCreatives = params.supabaseWriter
    ? await params.supabaseWriter.fetchExistingCreatives(Array.from(creativeIds))
    : {};
  const existingMaps = params.supabaseWriter
    ? await params.supabaseWriter.fetchExistingAdCreativeMap(Array.from(adIds))
    : {};

  for (const ad of ads) {
    const adId = asString(ad["id"]);
    if (!adId) continue;
    const creativeRawRecord = asRecord(ad["creative"]);
    if (!creativeRawRecord) continue;
    const creativeId = asString(creativeRawRecord["id"]);
    if (!creativeId) continue;
    let normalized = creativeMap.get(creativeId);
    if (!normalized) {
      normalized = normalizeCreative(creativeRawRecord);
      if (normalized.warnings.length) {
        for (const warning of normalized.warnings) {
          params.warnings.push(`Creative ${creativeId}: ${warning}`);
        }
      }
      creativeMap.set(creativeId, normalized);

      const identity: CreativeIdentityRow = {
        creative_id: creativeId,
        creative_name: normalized.creativeName,
        object_story_id: normalized.objectStoryId,
        effective_object_story_id: normalized.effectiveObjectStoryId,
        format: normalized.format,
        call_to_action_type: normalized.callToActionType,
        destination_domain: normalized.destinationDomain,
        destination_path: normalized.destinationPath,
        image_hash: normalized.imageHash,
        video_id: normalized.videoId,
        thumbnail_url: normalized.thumbnailUrl,
        image_url: normalized.imageUrl,
        facebook_page_id: normalized.facebookPageId,
        instagram_actor_id: normalized.instagramActorId,
        is_carousel: normalized.isCarousel,
        is_dynamic: normalized.isDynamic,
        is_catalog: normalized.isCatalog,
        asset_url_ephemeral: normalized.assetUrlEphemeral,
        first_seen_at: existingCreatives[creativeId]?.first_seen_at ?? params.nowIso,
        last_seen_at: params.nowIso,
        current_content_hash: normalized.contentHash,
        metadata: { ...normalized.metadata, warnings: normalized.warnings }
      };
      creativeIdentities.push(identity);

      const needsVersion =
        !existingCreatives[creativeId]?.current_content_hash ||
        existingCreatives[creativeId]?.current_content_hash !== normalized.contentHash;
      if (needsVersion) {
        const content = normalized.normalizedContent;
        creativeVersions.push({
          creative_id: creativeId,
          content_hash: normalized.contentHash,
          primary_text: content.primaryText,
          headline: content.headline,
          description: content.description,
          call_to_action_type: normalized.callToActionType ?? null,
          destination_domain: content.destinationDomain,
          destination_path: content.destinationPath,
          object_story_spec: asRecord(creativeRawRecord["object_story_spec"]),
          asset_feed_spec: asRecord(creativeRawRecord["asset_feed_spec"]),
          carousel_cards: content.carouselCards,
          asset_metadata: normalized.metadata,
          captured_at: params.nowIso,
          source_run_id: params.runId
        });
      }
    }

    const mapKey = `${adId}:${creativeId}`;
    const firstSeen = existingMaps[mapKey]?.first_seen_at ?? params.nowIso;
    adCreativeRows.push({
      ad_id: adId,
      creative_id: creativeId,
      campaign_id: asString(ad["campaign_id"]),
      adset_id: asString(ad["adset_id"]),
      first_seen_at: firstSeen,
      last_seen_at: params.nowIso,
      source_run_id: params.runId
    });
  }

  return { creatives: creativeIdentities, versions: creativeVersions, map: adCreativeRows };
}

async function performSupabaseWrites(payload: {
  writer: MetaWriter;
  normalizedRows: {
    account: Record<string, unknown>[];
    campaign: Record<string, unknown>[];
    adset: Record<string, unknown>[];
    ad: Record<string, unknown>[];
  };
  creativePayload: {
    creatives: CreativeIdentityRow[];
    versions: NormalizedCreativeVersion[];
    map: AdCreativeMapRow[];
  };
}) {
  await payload.writer.upsertInsights("meta_account_daily", payload.normalizedRows.account);
  await payload.writer.upsertInsights("meta_campaign_daily", payload.normalizedRows.campaign);
  await payload.writer.upsertInsights("meta_adset_daily", payload.normalizedRows.adset);
  await payload.writer.upsertInsights("meta_ad_daily", payload.normalizedRows.ad);
  await payload.writer.upsertCreatives(payload.creativePayload.creatives);
  await payload.writer.upsertCreativeVersions(payload.creativePayload.versions);
  await payload.writer.upsertAdCreativeMap(payload.creativePayload.map);
}

function computePayloadHash(
  normalizedRows: {
    account: Record<string, unknown>[];
    campaign: Record<string, unknown>[];
    adset: Record<string, unknown>[];
    ad: Record<string, unknown>[];
  },
  creativePayload: {
    creatives: CreativeIdentityRow[];
    versions: NormalizedCreativeVersion[];
    map: AdCreativeMapRow[];
  }
): string {
  const hash = crypto.createHash("sha256");
  const snapshot = {
    account: sortByKey(normalizedRows.account, "metric_date"),
    campaign: sortByKey(normalizedRows.campaign, "campaign_id"),
    adset: sortByKey(normalizedRows.adset, "adset_id"),
    ad: sortByKey(normalizedRows.ad, "ad_id"),
    creatives: sortByKey(creativePayload.creatives, "creative_id"),
    versions: sortByKey(creativePayload.versions, "content_hash"),
    map: sortByKey(creativePayload.map, "ad_id")
  };
  hash.update(JSON.stringify(snapshot));
  return hash.digest("hex");
}

function sortByKey<T extends Record<string, unknown>>(rows: T[], key: string): T[] {
  return [...rows].sort((a, b) => {
    const av = (a[key] ?? "") as string;
    const bv = (b[key] ?? "") as string;
    return String(av).localeCompare(String(bv));
  });
}

function castRecords(values: unknown[]): Record<string, unknown>[] {
  return values
    .map((entry) => asRecord(entry))
    .filter((record): record is Record<string, unknown> => Boolean(record));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function emptyNormalizedRows() {
  return {
    account: [] as Record<string, unknown>[],
    campaign: [] as Record<string, unknown>[],
    adset: [] as Record<string, unknown>[],
    ad: [] as Record<string, unknown>[]
  };
}

function emptyCreativePayload() {
  return {
    creatives: [] as CreativeIdentityRow[],
    versions: [] as NormalizedCreativeVersion[],
    map: [] as AdCreativeMapRow[]
  };
}

function emptyRowCounts() {
  return {
    account_daily: 0,
    campaign_daily: 0,
    adset_daily: 0,
    ad_daily: 0,
    creatives: 0,
    creative_versions: 0,
    ad_creative_map: 0
  };
}

function computeRowCounts(
  normalizedRows: {
    account: Record<string, unknown>[];
    campaign: Record<string, unknown>[];
    adset: Record<string, unknown>[];
    ad: Record<string, unknown>[];
  },
  creativePayload: {
    creatives: CreativeIdentityRow[];
    versions: NormalizedCreativeVersion[];
    map: AdCreativeMapRow[];
  }
) {
  return {
    account_daily: normalizedRows.account.length,
    campaign_daily: normalizedRows.campaign.length,
    adset_daily: normalizedRows.adset.length,
    ad_daily: normalizedRows.ad.length,
    creatives: creativePayload.creatives.length,
    creative_versions: creativePayload.versions.length,
    ad_creative_map: creativePayload.map.length
  };
}

async function buildCreativePayloadSafe(params: {
  graphClient: GraphClientLike;
  accountId: string;
  runId: string;
  writer: MetaWriter | null;
  nowIso: string;
  warnings: string[];
}) {
  try {
    const payload = await buildCreativePayload({
      graphClient: params.graphClient,
      accountId: params.accountId,
      runId: params.runId,
      supabaseWriter: params.writer,
      nowIso: params.nowIso,
      warnings: params.warnings
    });
    return { payload, failed: false };
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    params.warnings.push(`Creative ingestion failed: ${message}`);
    return { payload: emptyCreativePayload(), failed: true };
  }
}

async function fetchRequiredInsights(params: {
  graphClient: GraphClientLike;
  accountId: string;
  range: { since: string; until: string };
}): Promise<Record<InsightLevel, Record<string, unknown>[]>> {
  const baseParams = {
    time_range: { since: params.range.since, until: params.range.until },
    time_increment: 1,
    limit: 500,
    action_attribution_windows: ["7d_click", "1d_view"]
  };

  const levelData: Record<InsightLevel, Record<string, unknown>[]> = {
    account: [],
    campaign: [],
    adset: [],
    ad: []
  };

  for (const level of ["account", "campaign", "adset", "ad"] as InsightLevel[]) {
    try {
      const rows = await params.graphClient.fetchCollection(`act_${params.accountId}/insights`, {
        ...baseParams,
        level,
        fields: insightFieldsFor(level)
      }, { label: `insights_${level}` });
      levelData[level] = castRecords(rows);
    } catch (error) {
      throw new Error(`Failed to fetch ${level} insights: ${sanitizeErrorMessage(error)}`);
    }
  }

  return levelData;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return redactAccessTokens(error.message);
  }
  if (typeof error === "string") {
    return redactAccessTokens(error);
  }
  return "Unknown Meta ingestion error";
}

function redactAccessTokens(value: string): string {
  return value.replace(/access_token=[^&\s]+/gi, "access_token=REDACTED");
}

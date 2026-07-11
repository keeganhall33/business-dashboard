import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runMetaHistoryIngestion } from "../src/lib/meta-intel/ingestion.ts";
import { normalizeCreative } from "../src/lib/meta-intel/creative-normalization.ts";
import type {
  GraphClientLike,
  GraphRequestCounters,
  GraphUsageSnapshot,
  MetaWriter,
  MetaHistorySummary,
  CreativeIdentityRow,
  NormalizedCreativeVersion,
  AdCreativeMapRow
} from "../src/lib/meta-intel/types.ts";
import { INSIGHT_CONFLICT_KEYS } from "../src/lib/meta-intel/types.ts";

const creativeFixture = JSON.parse(
  readFileSync(new URL("./fixtures/meta-history/creative.json", import.meta.url), "utf8")
);
const referenceDate = new Date("2026-07-11T19:00:00Z");

class StubGraphClient implements GraphClientLike {
  private calls: GraphRequestCounters = {};
  private readonly config: {
      account: Record<string, unknown>;
      insights: Record<string, Record<string, unknown>[]>;
      ads?: Record<string, unknown>[];
      failLabels?: Set<string>;
      usage?: GraphUsageSnapshot;
      versionWarnings?: string[];
      returnedVersion?: string | null;
      counters?: GraphRequestCounters;
    };

  constructor(config: {
    account: Record<string, unknown>;
    insights: Record<string, Record<string, unknown>[]>;
    ads?: Record<string, unknown>[];
    failLabels?: Set<string>;
    usage?: GraphUsageSnapshot;
    versionWarnings?: string[];
    returnedVersion?: string | null;
    counters?: GraphRequestCounters;
  }) {
    this.config = config;
  }

  async fetchCollection(_path: string, _params: Record<string, unknown>, config: { label: string }) {
    this.calls[config.label] = (this.calls[config.label] ?? 0) + 1;
    if (this.config.failLabels?.has(config.label)) {
      throw new Error(`${config.label} failure access_token=tossed_token`);
    }
    if (config.label === "ads") {
      return this.config.ads ?? [];
    }
    return this.config.insights[config.label] ?? [];
  }

  async get(_path: string, _params: Record<string, unknown>, config: { label: string }) {
    if (this.config.failLabels?.has(config.label)) {
      throw new Error("account metadata failure access_token=boom");
    }
    return this.config.account;
  }

  getUsageSnapshot(): GraphUsageSnapshot {
    return this.config.usage ?? { throttleEvents: [] };
  }

  getRequestCounters(): GraphRequestCounters {
    return { ...this.config.counters, ...this.calls };
  }

  getVersionWarnings(): string[] {
    return this.config.versionWarnings ?? [];
  }

  getReturnedVersion(): string | null {
    return this.config.returnedVersion ?? "v25.0";
  }
}

class StubWriter implements MetaWriter {
  public created: Array<{ runId: string }> = [];
  public finalized: Array<{ status: string; warnings: string[]; errorSummary: string | null }> = [];
  public upserts: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  public creativeUpserts: Array<{ type: string; rows: unknown[] }> = [];
  public existingCreatives: Record<string, { first_seen_at: string | null; current_content_hash: string | null }> = {};
  public existingMap: Record<string, { first_seen_at: string | null }> = {};
  private readonly options: { failWrites?: boolean };

  constructor(options: { failWrites?: boolean } = {}) {
    this.options = options;
  }

  async createRun(runId: string, payload: { startedAt: string; requestedVersion: string; sourceCommit?: string | null }) {
    void payload;
    this.created.push({ runId });
  }

  async finalizeRun(
    _runId: string,
    payload: {
      status: string;
      warnings: string[];
      errorSummary: string | null;
    }
  ) {
    this.finalized.push(payload);
  }

  async upsertInsights(table: keyof typeof INSIGHT_CONFLICT_KEYS, rows: Record<string, unknown>[]) {
    if (this.options.failWrites && table === "meta_account_daily") {
      throw new Error("db failure access_token=writer_token");
    }
    if (rows.length) {
      this.upserts.push({ table, rows });
    }
  }

  async upsertCreatives(rows: CreativeIdentityRow[]) {
    if (rows.length) {
      this.creativeUpserts.push({ type: "creatives", rows });
    }
  }

  async upsertCreativeVersions(rows: NormalizedCreativeVersion[]) {
    if (rows.length) {
      this.creativeUpserts.push({ type: "versions", rows });
    }
  }

  async upsertAdCreativeMap(rows: AdCreativeMapRow[]) {
    if (rows.length) {
      this.creativeUpserts.push({ type: "map", rows });
    }
  }

  async fetchExistingCreatives(): Promise<Record<string, { first_seen_at: string | null; current_content_hash: string | null }>> {
    return this.existingCreatives;
  }

  async fetchExistingAdCreativeMap(): Promise<Record<string, { first_seen_at: string | null }>> {
    return this.existingMap;
  }
}

function buildInsightsRow(overrides: Record<string, unknown> = {}) {
  return {
    account_id: "123",
    date_start: "2026-07-08",
    attribution_setting: "7d_click,1d_view",
    spend: "45",
    impressions: "1000",
    reach: "800",
    clicks: "50",
    actions: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
      { action_type: "landing_page_view", value: "70" }
    ],
    action_values: [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "900" }
    ],
    ...overrides
  };
}

function buildGraphConfig(overrides: Partial<ConstructorParameters<typeof StubGraphClient>[0]> = {}) {
  return {
    account: {
      id: "123",
      name: "Meta Account",
      currency: "USD",
      timezone_name: "America/Los_Angeles",
      attribution_spec: [
        { event_type: "CLICK_THROUGH", window_days: 7 },
        { event_type: "VIEW_THROUGH", window_days: 1 }
      ]
    },
    insights: {
      insights_account: [buildInsightsRow()],
      insights_campaign: [
        {
          ...buildInsightsRow({ campaign_id: "cmp_1", campaign_name: "Campaign", date_start: "2026-07-08" })
        }
      ],
      insights_adset: [
        {
          ...buildInsightsRow({ adset_id: "adset_1", date_start: "2026-07-08" })
        }
      ],
      insights_ad: [
        {
          ...buildInsightsRow({ ad_id: "ad_1", creative_id: "cr_1", date_start: "2026-07-08" })
        }
      ]
    },
    ads: [
      {
        id: "ad_1",
        campaign_id: "cmp_1",
        adset_id: "adset_1",
        creative: JSON.parse(JSON.stringify(creativeFixture))
      }
    ],
    failLabels: new Set<string>(),
    usage: { throttleEvents: [] },
    versionWarnings: [],
    returnedVersion: "v25.0",
    counters: {},
    ...overrides
  } satisfies ConstructorParameters<typeof StubGraphClient>[0];
}

function rowsFor(writer: StubWriter, table: string) {
  return writer.upserts.find((entry) => entry.table === table)?.rows ?? [];
}

test("successful ingestion writes rows and finalizes LIVE", async () => {
  const graph = new StubGraphClient(buildGraphConfig());
  const writer = new StubWriter();
  const summary = (await runMetaHistoryIngestion({
    accessToken: "token",
    configuredAccountId: "123",
    writer,
    graphClientFactory: () => graph,
    referenceDate
  })) as MetaHistorySummary;
  assert.equal(summary.status, "LIVE");
  assert.equal(writer.finalized.at(-1)?.status, "LIVE");
  assert.ok(rowsFor(writer, "meta_account_daily").length === 1);
});

test("account metadata failure marks run FAILED", async () => {
  const graph = new StubGraphClient(buildGraphConfig({ failLabels: new Set(["ad_account"]) }));
  const writer = new StubWriter();
  await assert.rejects(() =>
    runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate })
  );
  assert.equal(writer.finalized.at(-1)?.status, "FAILED");
  assert.equal(writer.upserts.length, 0);
});

test("required insight failure marks run FAILED", async () => {
  const graph = new StubGraphClient(buildGraphConfig({ failLabels: new Set(["insights_account"]) }));
  const writer = new StubWriter();
  await assert.rejects(() =>
    runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate })
  );
  assert.equal(writer.finalized.at(-1)?.status, "FAILED");
  assert.equal(writer.upserts.length, 0);
});

test("creative fetch failure results in PARTIAL", async () => {
  const graph = new StubGraphClient(buildGraphConfig({ failLabels: new Set(["ads"]) }));
  const writer = new StubWriter();
  const summary = await runMetaHistoryIngestion({
    accessToken: "token",
    configuredAccountId: "123",
    writer,
    graphClientFactory: () => graph,
    referenceDate
  });
  assert.equal(summary.status, "PARTIAL");
  assert.equal(writer.finalized.at(-1)?.status, "PARTIAL");
  assert.equal(writer.creativeUpserts.length, 0);
});

test("write failure finalizes FAILED with sanitized error", async () => {
  const graph = new StubGraphClient(buildGraphConfig());
  const writer = new StubWriter({ failWrites: true });
  await assert.rejects(() =>
    runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate })
  );
  const finalize = writer.finalized.at(-1);
  assert.equal(finalize?.status, "FAILED");
  assert.match(finalize?.errorSummary ?? "", /access_token=REDACTED/);
});

test("zero spend roas results in null", async () => {
  const graph = new StubGraphClient(
    buildGraphConfig({
      insights: {
        insights_account: [buildInsightsRow({ spend: "0" })],
        insights_campaign: [],
        insights_adset: [],
        insights_ad: []
      }
    })
  );
  const writer = new StubWriter();
  await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  const row = rowsFor(writer, "meta_account_daily")[0] ?? {};
  assert.equal(row.roas, null);
});

test("duplicate creative versions skipped when hash unchanged", async () => {
  const graph = new StubGraphClient(buildGraphConfig());
  const writer = new StubWriter();
  const normalized = normalizeCreative(creativeFixture);
  writer.existingCreatives[normalized.creativeId] = { first_seen_at: null, current_content_hash: normalized.contentHash };
  await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  assert.ok(!writer.creativeUpserts.some((entry) => entry.type === "versions"));
});

test("empty insights do not trigger deletions and still mark LIVE", async () => {
  const graph = new StubGraphClient(
    buildGraphConfig({ insights: { insights_account: [], insights_campaign: [], insights_adset: [], insights_ad: [] }, ads: [] })
  );
  const writer = new StubWriter();
  const summary = await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  assert.equal(summary.status, "LIVE");
  assert.equal(writer.upserts.length, 0);
});

test("attribution accepted label retained", async () => {
  const graph = new StubGraphClient(buildGraphConfig());
  const writer = new StubWriter();
  await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  const row = rowsFor(writer, "meta_account_daily")[0] ?? {};
  assert.equal(row.attribution_setting, "7d_click_1d_view");
});

test("unknown attribution falls back to unknown_default", async () => {
  const graph = new StubGraphClient(
    buildGraphConfig({
      insights: {
        insights_account: [buildInsightsRow({ attribution_setting: "1d_click" })],
        insights_campaign: [],
        insights_adset: [],
        insights_ad: []
      }
    })
  );
  const writer = new StubWriter();
  await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  const row = rowsFor(writer, "meta_account_daily")[0] ?? {};
  assert.equal(row.attribution_setting, "unknown_default");
});

test("account_default attribution label is preserved", async () => {
  const graph = new StubGraphClient(
    buildGraphConfig({
      insights: {
        insights_account: [buildInsightsRow({ attribution_setting: "account_default" })],
        insights_campaign: [],
        insights_adset: [],
        insights_ad: []
      }
    })
  );
  const writer = new StubWriter();
  await runMetaHistoryIngestion({ accessToken: "token", configuredAccountId: "123", writer, graphClientFactory: () => graph, referenceDate });
  const row = rowsFor(writer, "meta_account_daily")[0] ?? {};
  assert.equal(row.attribution_setting, "account_default");
});

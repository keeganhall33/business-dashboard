import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchWooMetricsWithMode,
  mapSemanticWooToCommerceTelemetry,
  resolveWooMetricsMode
} from "../src/lib/supabase/queries.ts";

import type { CommerceTelemetry } from "../src/lib/types/dashboard.ts";
type FetchClient = Parameters<typeof fetchWooMetricsWithMode>[0];

type RpcResult = { data: unknown; error: { message?: string } | null };

type StubConfig = {
  legacy?: RpcResult | (() => RpcResult | Promise<RpcResult>);
  semantic?: RpcResult | (() => RpcResult | Promise<RpcResult>);
};

class StubSupabaseClient {
  #config: StubConfig;
  calls: Array<{ fn: string; params: Record<string, unknown> }>; 

  constructor(config: StubConfig) {
    this.#config = config;
    this.calls = [];
  }

  async rpc(fn: string, params: Record<string, unknown> = {}): Promise<RpcResult> {
    this.calls.push({ fn, params });
    if (fn === "get_woo_metrics") {
      return typeof this.#config.legacy === "function" ? await this.#config.legacy() : this.#config.legacy ?? { data: {}, error: null };
    }
    if (fn === "get_woo_metrics_semantic_v1") {
      return typeof this.#config.semantic === "function"
        ? await this.#config.semantic()
        : this.#config.semantic ?? { data: null, error: null };
    }
    throw new Error(`Unexpected rpc call: ${fn}`);
  }

  schema(): StubSupabaseClient {
    return this;
  }
}

class StubLogger {
  infoEntries: unknown[] = [];
  warnEntries: unknown[] = [];
  errorEntries: unknown[] = [];

  info(...args: unknown[]) {
    this.infoEntries.push(args);
  }

  warn(...args: unknown[]) {
    this.warnEntries.push(args);
  }

  error(...args: unknown[]) {
    this.errorEntries.push(args);
  }
}

const ORIGINAL_MODE = process.env.WOO_METRICS_MODE;
const RANGE = { startDate: "2026-07-01", endDate: "2026-07-07" };

const USD_SEMANTIC_PAYLOAD = {
  metric_data: {
    summary: {
      non_unspecified_currency_count: 1,
      unspecified_currency_orders: 0,
      has_unspecified_currency: false,
      order_total_single_currency: 1234,
      order_count_single_currency: 4,
      avg_order_value_single_currency: 308.5
    },
    daily: [
      {
        effective_business_date: "2026-07-01",
        non_unspecified_currency_count: 1,
        unspecified_currency_orders: 0,
        has_unspecified_currency: false,
        order_total_single_currency: 400,
        order_count_single_currency: 1,
        avg_order_value_single_currency: 400
      },
      {
        effective_business_date: "2026-07-02",
        non_unspecified_currency_count: 1,
        unspecified_currency_orders: 0,
        has_unspecified_currency: false,
        order_total_single_currency: 834,
        order_count_single_currency: 3,
        avg_order_value_single_currency: 278
      }
    ]
  },
  metadata: {
    requested_start_date: RANGE.startDate,
    requested_end_date: RANGE.endDate,
    includes_partial_day: false,
    includes_future_dates: false,
    matching_data_recency_status: "fresh",
    coverage: {
      requested_day_count: 7,
      days_with_matching_orders: 2,
      coverage_verifiable: false
    }
  }
};

test.after(() => {
  process.env.WOO_METRICS_MODE = ORIGINAL_MODE;
});

test("semantic adapter maps USD-only payload", () => {
  const result = mapSemanticWooToCommerceTelemetry(USD_SEMANTIC_PAYLOAD);
  assert.equal(result.summarySafe, true);
  assert.deepEqual(result.telemetry?.summary.revenue, 1234);
  assert.equal(result.telemetry?.summary.orders, 4);
  assert.equal(result.telemetry?.timeseries.length, 2);
});

test("semantic adapter handles empty payload", () => {
  const result = mapSemanticWooToCommerceTelemetry(null);
  assert.equal(result.summarySafe, false);
  assert.equal(result.telemetry?.summary.revenue, null);
  assert.equal(result.unsupportedReason, "missing_summary");
});

test("semantic adapter rejects multi-currency and preserves safe daily entries", () => {
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  payload.metric_data.summary.non_unspecified_currency_count = 2;
  const result = mapSemanticWooToCommerceTelemetry(payload);
  assert.equal(result.summarySafe, false);
  assert.equal(result.telemetry?.summary.orders, null);
  assert.equal(result.telemetry?.timeseries.length, 2);
  assert.equal(result.unsupportedReason, "multiple_currencies");
});

test("semantic adapter rejects unspecified currency ranges", () => {
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  payload.metric_data.summary.has_unspecified_currency = true;
  payload.metric_data.summary.unspecified_currency_orders = 5;
  const result = mapSemanticWooToCommerceTelemetry(payload);
  assert.equal(result.summarySafe, false);
  assert.equal(result.unsupportedReason, "unspecified_currency_present");
});

test("resolveWooMetricsMode defaults to legacy", () => {
  process.env.WOO_METRICS_MODE = "";
  assert.equal(resolveWooMetricsMode(undefined), "legacy");
  assert.equal(resolveWooMetricsMode("   "), "legacy");
  assert.equal(resolveWooMetricsMode("semantic"), "semantic");
});

test("semantic mode falls back to legacy when RPC errors", async () => {
  process.env.WOO_METRICS_MODE = "semantic";
  const legacyPayload: CommerceTelemetry["woo"] = {
    summary: {
      revenue: 500,
      orders: 5,
      avgOrderValue: 100,
      discountTotal: null,
      shippingTotal: null,
      taxTotal: null,
      items: null
    },
    timeseries: []
  };
  const stub = new StubSupabaseClient({
    legacy: { data: legacyPayload, error: null },
    semantic: { data: null, error: { message: "boom" } }
  });
  const logger = new StubLogger();
  const result = await fetchWooMetricsWithMode(stub as unknown as FetchClient, RANGE, { logger });
  assert.ok(result, "legacy payload should be returned when semantic call fails");
  assert.equal(result.summary?.orders, 5);
  assert.equal(logger.errorEntries.length, 1);
  const wrapperCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics_semantic_v1");
  assert.equal(wrapperCalls.length, 1);
});

test("shadow mode logs differences and still returns legacy payload", async () => {
  process.env.WOO_METRICS_MODE = "shadow";
  const legacyPayload: CommerceTelemetry["woo"] = {
    summary: {
      revenue: 400,
      orders: 4,
      avgOrderValue: 100,
      discountTotal: null,
      shippingTotal: null,
      taxTotal: null,
      items: null
    },
    timeseries: [
      { date: "2026-07-01", revenue: 100, orders: 1 },
      { date: "2026-07-02", revenue: 300, orders: 3 }
    ]
  };
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  payload.metadata.includes_partial_day = true;
  const stub = new StubSupabaseClient({ legacy: { data: legacyPayload, error: null }, semantic: { data: payload, error: null } });
  const logger = new StubLogger();
  const result = await fetchWooMetricsWithMode(stub as unknown as FetchClient, RANGE, { logger });
  assert.ok(result, "legacy payload should be preserved in shadow mode");
  assert.equal(result.summary?.orders, 4);
  assert.equal(logger.infoEntries.length, 1);
  const logEntry = logger.infoEntries[0] as unknown[];
  const logPayload = (logEntry?.[1] ?? {}) as Record<string, unknown>;
  const summary = logPayload.summary as Record<string, unknown> | undefined;
  assert.equal((summary?.legacy as Record<string, unknown> | undefined)?.orders, 4);
  const semanticSummary = summary?.semantic as Record<string, unknown> | undefined;
  assert.equal(semanticSummary?.safeSingleCurrency, true);
  const semanticCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics_semantic_v1");
  const legacyCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics");
  assert.equal(semanticCalls.length, 1);
  assert.equal(legacyCalls.length, 1);
});

test("semantic mode uses public wrapper RPC", async () => {
  process.env.WOO_METRICS_MODE = "semantic";
  const stub = new StubSupabaseClient({
    legacy: { data: { summary: null, timeseries: [] }, error: null },
    semantic: { data: USD_SEMANTIC_PAYLOAD, error: null }
  });
  await fetchWooMetricsWithMode(stub as unknown as FetchClient, RANGE, { logger: new StubLogger() });
  const semanticCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics_semantic_v1");
  assert.equal(semanticCalls.length, 1);
  assert.deepEqual(semanticCalls[0].params, { start_date: RANGE.startDate, end_date: RANGE.endDate });
});

test("legacy mode skips semantic wrapper RPC", async () => {
  process.env.WOO_METRICS_MODE = "legacy";
  const stub = new StubSupabaseClient({ legacy: { data: { summary: null, timeseries: [] }, error: null } });
  await fetchWooMetricsWithMode(stub as unknown as FetchClient, RANGE, { logger: new StubLogger() });
  const semanticCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics_semantic_v1");
  assert.equal(semanticCalls.length, 0);
  const legacyCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics");
  assert.equal(legacyCalls.length, 1);
});

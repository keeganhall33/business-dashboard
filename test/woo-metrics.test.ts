import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchWooMetricsWithMode,
  mapSemanticWooToCommerceTelemetry,
  resolveWooMetricsMode
} from "../src/lib/supabase/queries.ts";

import type { CommerceTelemetry } from "../src/lib/types/dashboard.ts";
type FetchClient = Parameters<typeof fetchWooMetricsWithMode>[0];
type SemanticSummaryShape = {
  currency_totals?: Array<{
    currency?: string | null;
    order_count?: number | null;
    order_total?: number | null;
    avg_order_value?: number | null;
  }>;
  has_unspecified_currency?: boolean | null;
  unspecified_currency_orders?: number | null;
  order_total_single_currency?: number | null;
  order_count_single_currency?: number | null;
  avg_order_value_single_currency?: number | null;
};
type SemanticDailyShape = SemanticSummaryShape & {
  effective_business_date?: string | null;
  has_orders?: boolean | null;
};

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
      avg_order_value_single_currency: 308.5,
      currency_totals: [
        {
          currency: "USD",
          order_count: 4,
          order_total: 1234,
          avg_order_value: 308.5
        }
      ]
    },
    daily: [
      {
        effective_business_date: "2026-07-01",
        non_unspecified_currency_count: 1,
        unspecified_currency_orders: 0,
        has_unspecified_currency: false,
        order_total_single_currency: 400,
        order_count_single_currency: 1,
        avg_order_value_single_currency: 400,
        currency_totals: [
          { currency: "USD", order_count: 1, order_total: 400, avg_order_value: 400 }
        ]
      },
      {
        effective_business_date: "2026-07-02",
        non_unspecified_currency_count: 1,
        unspecified_currency_orders: 0,
        has_unspecified_currency: false,
        order_total_single_currency: 834,
        order_count_single_currency: 3,
        avg_order_value_single_currency: 278,
        currency_totals: [
          { currency: "USD", order_count: 3, order_total: 834, avg_order_value: 278 }
        ]
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

test("semantic adapter emits timeseries entries only when daily projections are safe", () => {
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  const unsupportedDaily: SemanticDailyShape = {
    effective_business_date: "2026-07-03",
    has_unspecified_currency: true,
    currency_totals: [],
    order_total_single_currency: null,
    order_count_single_currency: null,
    unspecified_currency_orders: 1,
    avg_order_value_single_currency: null
  };
  const daily = payload.metric_data.daily as SemanticDailyShape[] | undefined;
  daily?.push(unsupportedDaily);
  const result = mapSemanticWooToCommerceTelemetry(payload);
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
  payload.metric_data.summary.currency_totals?.push({
    currency: "EUR",
    order_count: 1,
    order_total: 50,
    avg_order_value: 50
  });
  const result = mapSemanticWooToCommerceTelemetry(payload);
  assert.equal(result.summarySafe, false);
  assert.equal(result.telemetry?.summary.orders, null);
  assert.equal(result.telemetry?.timeseries.length, 2);
  assert.equal(result.unsupportedReason, "multiple_currencies");
});

test("semantic adapter rejects unspecified currency ranges", () => {
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  const summary = payload.metric_data.summary as SemanticSummaryShape;
  summary.has_unspecified_currency = true;
  summary.unspecified_currency_orders = 5;
  summary.currency_totals = [
    { currency: "", order_count: 5, order_total: 500, avg_order_value: 100 }
  ];
  const result = mapSemanticWooToCommerceTelemetry(payload);
  assert.equal(result.summarySafe, false);
  assert.equal(result.unsupportedReason, "unspecified_currency_present");
});

test("semantic adapter requires single-currency projections", () => {
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  const summary = payload.metric_data.summary as SemanticSummaryShape;
  summary.order_total_single_currency = null;
  const result = mapSemanticWooToCommerceTelemetry(payload);
  assert.equal(result.summarySafe, false);
  assert.equal(result.unsupportedReason, "missing_single_currency_projection");
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
  assert.ok(result.payload);
  assert.equal(result.payload?.summary?.orders, 5);
  assert.equal(logger.errorEntries.length, 1);
  const wrapperCalls = stub.calls.filter((call) => call.fn === "get_woo_metrics_semantic_v1");
  assert.equal(wrapperCalls.length, 1);
});

test("shadow mode fetches both sources but only warns on semantic errors", async () => {
  process.env.WOO_METRICS_MODE = "shadow";
  const legacyPayload: CommerceTelemetry["woo"] = {
    summary: {
      revenue: 1234,
      orders: 4,
      avgOrderValue: 308.5,
      discountTotal: null,
      shippingTotal: null,
      taxTotal: null,
      items: null
    },
    timeseries: [
      { date: "2026-07-01", revenue: 400, orders: 1 },
      { date: "2026-07-02", revenue: 834, orders: 3 }
    ]
  };
  const payload = structuredClone(USD_SEMANTIC_PAYLOAD);
  payload.metadata.includes_partial_day = true;
  const stub = new StubSupabaseClient({ legacy: { data: legacyPayload, error: null }, semantic: { data: payload, error: null } });
  const logger = new StubLogger();
  const result = await fetchWooMetricsWithMode(stub as unknown as FetchClient, RANGE, { logger });
  assert.ok(result, "legacy payload should be preserved in shadow mode");
  assert.ok(result.payload);
  assert.equal(result.payload?.summary?.orders, 4);
  assert.equal(logger.warnEntries.length, 0, "no warning logs expected when semantic succeeds");
  assert.equal(logger.errorEntries.length, 0, "no error logs expected when semantic succeeds");
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

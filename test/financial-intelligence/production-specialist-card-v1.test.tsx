import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildFinancialProductionSpecialistCardV1 } from "@/lib/financial-intelligence/production-specialist-card-v1";
import type {
  DashboardOverviewResponse,
  PerformanceBaselineMetric,
  PerformanceBaselineSnapshot
} from "@/lib/types/dashboard";

function metric(
  id: PerformanceBaselineMetric["id"],
  current: number | null,
  completeness: PerformanceBaselineMetric["currentCompleteness"] = "complete"
): PerformanceBaselineMetric {
  return {
    id,
    unit: id === "revenue" || id === "avg_order_value" ? "currency" : id.includes("rate") ? "percent" : "count",
    current,
    previous: null,
    delta: null,
    deltaPercent: null,
    currentCompleteness: completeness,
    previousCompleteness: "unknown"
  };
}

function baseline(): PerformanceBaselineSnapshot {
  return {
    range: {
      preset: "7d",
      startDate: "2026-09-01",
      endDate: "2026-09-07"
    },
    previousRange: {
      startDate: "2026-08-25",
      endDate: "2026-08-31"
    },
    metrics: {
      revenue: metric("revenue", 12500),
      orders: metric("orders", 8),
      avgOrderValue: metric("avg_order_value", 1562.5),
      sessions: metric("sessions", 100),
      purchaseConversionRate: metric("purchase_conversion_rate", 0.08),
      funnelCompletionRate: metric("funnel_completion_rate", 0.1)
    }
  };
}

function dashboard(
  dataMode: DashboardOverviewResponse["dataMode"] = "LIVE_DATA"
): DashboardOverviewResponse {
  return {
    dataMode,
    timestamp: "2026-09-07T12:00:00.000Z",
    performanceBaseline: baseline()
  } as DashboardOverviewResponse;
}

test("complete canonical revenue creates one bounded production Financial projection", () => {
  const card = buildFinancialProductionSpecialistCardV1(dashboard());

  assert.ok(card);
  assert.equal(card.id, "financial");
  assert.equal(card.source_mode, "PRODUCTION");
  assert.equal(card.truth_state, "KNOWN");
  assert.equal(card.evidence_freshness, "UNKNOWN");
  assert.match(card.what_changed, /\$12,500/);
  assert.match(card.why_it_matters, /Complete order count: 8/);
  assert.match(card.material_gap_or_risk, /Cash.*margin.*profitability.*runway.*receivables.*forecasts/);
  assert.equal(card.detail_href, "/data-evidence");
  assert.doesNotMatch(card.why_it_matters, /profit is|cash is|margin is/i);
});

test("partial, qualified, seed, and unavailable financial evidence fail closed", () => {
  const partial = dashboard();
  partial.performanceBaseline!.metrics.revenue.currentCompleteness = "partial";
  assert.equal(buildFinancialProductionSpecialistCardV1(partial), null);

  const qualified = dashboard();
  qualified.performanceBaseline!.metrics.revenue.currentQualifier = "at_least";
  assert.equal(buildFinancialProductionSpecialistCardV1(qualified), null);

  assert.equal(buildFinancialProductionSpecialistCardV1(dashboard("SEED_DATA")), null);

  const unavailable = dashboard();
  unavailable.performanceBaseline = null;
  assert.equal(buildFinancialProductionSpecialistCardV1(unavailable), null);
});

test("canonical zero revenue remains a known zero and UNKNOWN is never coerced to zero", () => {
  const zero = dashboard();
  zero.performanceBaseline!.metrics.revenue.current = 0;
  assert.match(
    buildFinancialProductionSpecialistCardV1(zero)?.what_changed ?? "",
    /\$0/
  );

  const unknown = dashboard();
  unknown.performanceBaseline!.metrics.revenue.current = null;
  assert.equal(buildFinancialProductionSpecialistCardV1(unknown), null);
});

test("Specialists production route uses same-request dashboard evidence without fixture imports", () => {
  const source = fs.readFileSync("src/app/(app)/specialists/page.tsx", "utf8");

  assert.match(source, /getDashboardOverview/);
  assert.match(source, /buildFinancialProductionSpecialistCardV1/);
  assert.match(source, /getSpecialistCapabilityStatusV1\(productionInput\)/);
  assert.doesNotMatch(source, /financial-intelligence\/fixtures/);
  assert.doesNotMatch(source, /getSpecialistCommandCenterCardsV1/);
});

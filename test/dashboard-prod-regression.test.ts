import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const prodOverview = JSON.parse(fs.readFileSync(`${moduleDir}/fixtures/prod-overview.json`, "utf-8"));
import { sanitizeDashboardData, sanitizeExecutiveInsights, ensureRevenuePerVisitorMetric } from "../src/lib/dashboard/sanitizers.ts";
import { buildIndustryOpportunities } from "../src/lib/industry-pulse.ts";
import { isActivePipelineStatus } from "../src/lib/pipeline/status.ts";

const fixture = prodOverview as unknown as typeof prodOverview;

test("partial day windows suppress trend conclusions", () => {
  const { insights, partialDayNotice } = sanitizeExecutiveInsights(fixture.executiveInsights);
  assert.ok(partialDayNotice?.toLowerCase().includes("data still ingesting"));
  assert.equal(insights?.trends.length ?? 0, 0);
});

test("revenue per visitor is derived from production telemetry", () => {
  const metrics = ensureRevenuePerVisitorMetric(fixture);
  const rpv = metrics.find((metric) => metric.metricKey === "revenue_per_visitor");
  assert.ok(rpv, "RPV metric should be injected");
  assert.ok((rpv?.currentValue as number) > 0, "RPV should be greater than zero");
});

test("paused opportunities are filtered from pipeline panels", () => {
  const sanitized = sanitizeDashboardData(fixture);
  const deals = sanitized.pipelinePanel?.deals ?? [];
  assert.ok(deals.every((deal) => isActivePipelineStatus(deal.status)));
});

test("industry pulse deduplicates alerts and requires evidence", () => {
  const opportunities = buildIndustryOpportunities(fixture.industryPulseSnapshot!);
  const seen = new Set<string>();
  opportunities.forEach((opportunity) => {
    const key = opportunity.concept.toLowerCase();
    assert.ok(!seen.has(key), `duplicate opportunity detected for ${opportunity.concept}`);
    assert.ok(opportunity.sourceUrl, "opportunity requires a source URL");
    seen.add(key);
  });
});

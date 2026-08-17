import assert from "node:assert/strict";
import test from "node:test";

import { hasUnacceptableRuinRisk } from "@/lib/strategic-advantage/contracts";
import { toStrategicAdvantageExecutiveViewModelsV1 } from "@/lib/strategic-advantage/executive-view-model";
import { STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1 } from "@/lib/strategic-advantage/fixtures";

function byId(id: string) {
  const item = STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1.find((fixture) => fixture.assessment_id === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("strategic qualitative value is not silently dollarized", () => {
  const prestige = byId("advantage-prestige-network-uncertain-economics");

  assert.equal(prestige.expected_value_range.currency, "UNKNOWN");
  assert.equal(prestige.expected_value_range.low_incremental_revenue_cents, null);
  assert.equal(prestige.expected_value_range.expected_incremental_revenue_cents, null);
  assert.equal(prestige.expected_value_range.high_incremental_revenue_cents, null);
  assert.equal(prestige.network_effect.level, "VERY_HIGH");
  assert.equal(prestige.brand_prestige_effect.level, "VERY_HIGH");
  assert.match(prestige.expected_value_range.notes.join(" "), /qualitative/i);
});

test("risk-of-ruin cannot be hidden by a large upside range", () => {
  const rejected = byId("advantage-reject-risk-of-ruin-capacity-conflict");
  const [view] = toStrategicAdvantageExecutiveViewModelsV1([rejected]);

  assert.equal(rejected.expected_value_range.high_incremental_revenue_cents, 6500000);
  assert.equal(rejected.risk_of_ruin.level, "UNACCEPTABLE");
  assert.equal(rejected.capacity_fit.level, "UNACCEPTABLE");
  assert.equal(hasUnacceptableRuinRisk(rejected), true);
  assert.equal(view.recommendation, "REJECT");
  assert.match(view.what_to_ignore_or_deprioritize.join(" "), /Headline revenue/);
});

test("opportunity cost remains explicit", () => {
  const highRevenue = byId("advantage-high-revenue-weak-defensibility-poor-cost");

  assert.ok(highRevenue.opportunity_cost.explicit_tradeoffs.length > 0);
  assert.ok(highRevenue.opportunity_cost.qualitative_costs.length > 0);
  assert.equal(highRevenue.opportunity_cost.capacity_hours_range.low, 60);
  assert.match(highRevenue.advantage_thesis, /Revenue alone is not an advantage/);
});

test("missing-data cold start lowers confidence instead of becoming zero", () => {
  const missing = byId("advantage-missing-data-cold-start-confidence-cap");

  assert.equal(missing.expected_value_range.currency, "UNKNOWN");
  assert.equal(missing.expected_value_range.expected_incremental_revenue_cents, null);
  assert.equal(missing.opportunity_cost.cash_cost_range_cents.currency, "UNKNOWN");
  assert.equal(missing.opportunity_cost.capacity_hours_range.low, null);
  assert.equal(missing.confidence.level, "insufficient_evidence");
  assert.equal(missing.confidence.cap, "insufficient_evidence");
  assert.match(missing.confidence.cap_reason ?? "", /Missing data caps confidence/);
});

test("component disagreement is preserved rather than collapsed into one opaque score", () => {
  const highRevenue = byId("advantage-high-revenue-weak-defensibility-poor-cost");
  const prestige = byId("advantage-prestige-network-uncertain-economics");

  assert.equal(highRevenue.expected_value_range.currency, "USD");
  assert.equal(highRevenue.defensibility.level, "LOW");
  assert.equal(highRevenue.capacity_fit.level, "HIGH");
  assert.equal(highRevenue.recommendation, "DEPRIORITIZE");

  assert.equal(prestige.expected_value_range.currency, "UNKNOWN");
  assert.equal(prestige.defensibility.level, "HIGH");
  assert.equal(prestige.network_effect.level, "VERY_HIGH");
  assert.equal(prestige.recommendation, "LEARN_FIRST");
});

test("fixture ordering and executive view-model render semantics are deterministic", () => {
  const ids = STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1.map((fixture) => fixture.assessment_id);
  assert.deepEqual(ids, [
    "advantage-high-revenue-weak-defensibility-poor-cost",
    "advantage-high-upside-reversible-learning-option",
    "advantage-missing-data-cold-start-confidence-cap",
    "advantage-prestige-network-uncertain-economics",
    "advantage-reject-risk-of-ruin-capacity-conflict"
  ]);

  const first = JSON.stringify(toStrategicAdvantageExecutiveViewModelsV1(STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1));
  const second = JSON.stringify(toStrategicAdvantageExecutiveViewModelsV1(STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1));
  assert.equal(first, second);
  assert.match(first, /why_this_creates_advantage/);
  assert.match(first, /what_is_hard_to_copy/);
  assert.match(first, /next_high_leverage_move/);
});

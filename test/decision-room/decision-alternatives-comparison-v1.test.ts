import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionAlternativesComparisonViewModelV1 } from "@/lib/decision-room/alternatives/adapter";
import { DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1 } from "@/lib/decision-room/alternatives/fixtures";
import { UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1 } from "@/lib/decision-intelligence/uncertainty/fixtures";

function byId(id: string) {
  const fixture = UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.find((item) => item.decision_id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}

test("sparse evidence makes low-risk experiment-first preferred without hiding unknowns", () => {
  const comparison = buildDecisionAlternativesComparisonViewModelV1(byId("uncertainty-experiment-first-script"));
  const preferred = comparison.alternatives.find((alternative) => alternative.alternative_id === comparison.preferred_alternative_id);

  assert.equal(comparison.decision_mode, "EXPERIMENT_FIRST");
  assert.equal(preferred?.kind, "LOW_RISK_TEST");
  assert.equal(preferred?.status, "PREFERRED");
  assert.equal(comparison.value_of_information, "HIGH");
  assert.equal(comparison.cheapest_credible_test, "Draft a one-question validation script and review it internally before external use.");
  assert.deepEqual(comparison.critical_unknowns, ["Warm intro conversion to serious collector meeting"]);
  assert.match(comparison.opportunity_cost_summary, /smallest credible attention block/);
  assert.ok(comparison.what_would_change_my_mind.length > 0);
  assert.deepEqual(comparison.revision_triggers, comparison.what_would_change_my_mind);
});

test("unbounded downside forces defer-for-safety and leaves rejected alternatives visible", () => {
  const comparison = buildDecisionAlternativesComparisonViewModelV1(byId("uncertainty-safety-defer-public-commitment"));
  const doNothing = comparison.alternatives.find((alternative) => alternative.kind === "DO_NOTHING");
  const aggressive = comparison.alternatives.find((alternative) => alternative.kind === "AGGRESSIVE_COMMIT");

  assert.equal(comparison.decision_mode, "DEFER_FOR_SAFETY");
  assert.equal(doNothing?.status, "PREFERRED");
  assert.equal(aggressive?.status, "REJECTED");
  assert.match(aggressive?.rejection_reason ?? "", /downside|irreversibility/i);
  assert.equal(comparison.downside_bound.bounded, false);
  assert.equal(comparison.strongest_downside, "UNBOUNDED: Legal, cash, and reputation downside are not bounded.");
  assert.equal(comparison.dashboard_flags.rejected_alternatives_visible, true);
});

test("proxy and analog evidence cannot become direct evidence in the comparison model", () => {
  const comparison = buildDecisionAlternativesComparisonViewModelV1(byId("uncertainty-bounded-private-room"));

  assert.equal(comparison.evidence_class.direct_evidence_count, 0);
  assert.equal(comparison.evidence_class.indirect_evidence_count, 2);
  assert.equal(comparison.evidence_class.strongest_supported_kind, "PROXY");
  assert.equal(comparison.evidence_class.proxy_evidence_cannot_be_direct, true);
  assert.ok(comparison.alternatives.every((alternative) => alternative.evidence_refs.includes("strategy-proxy-prestige-fit")));
});

test("missing money ranges remain UNKNOWN/null rather than becoming zero or false", () => {
  const comparison = buildDecisionAlternativesComparisonViewModelV1(byId("uncertainty-bounded-private-room"));

  assert.equal(comparison.downside_bound.estimated_loss_range.currency, "UNKNOWN");
  assert.equal(comparison.downside_bound.estimated_loss_range.low_cents, null);
  assert.equal(comparison.downside_bound.estimated_loss_range.high_cents, null);
  assert.notEqual(comparison.downside_bound.estimated_loss_range.low_cents, 0);
  assert.equal(comparison.dashboard_flags.missing_data_remains_unknown, true);
  assert.equal(comparison.dashboard_flags.keegan_action_required, false);
  assert.ok(comparison.revision_triggers.some((trigger) => /Direct economics/.test(trigger)));
});

test("dashboard fixture exports are deterministic and comparison-consumable", () => {
  const first = JSON.stringify(DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1);
  const second = JSON.stringify(UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.map(buildDecisionAlternativesComparisonViewModelV1));

  assert.equal(first, second);
  assert.ok(DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1.every((item) => item.contract_version === "decision_alternatives_comparison_v1"));
  assert.ok(DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1.every((item) => item.dashboard_flags.dashboard_consumable));
  assert.ok(DECISION_ALTERNATIVES_COMPARISON_FIXTURES_V1.every((item) => item.alternatives.length > 0));
});

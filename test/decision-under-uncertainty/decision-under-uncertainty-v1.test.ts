import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionUnderUncertaintyPlanV1, selectDecisionModeV1 } from "@/lib/decision-under-uncertainty/adapter";
import { DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1, DECISION_UNDER_UNCERTAINTY_PLAN_FIXTURES_V1 } from "@/lib/decision-under-uncertainty/fixtures";
import type { DecisionUnderUncertaintyInputV1, DecisionUnderUncertaintyModeV1 } from "@/lib/decision-under-uncertainty/contracts";
import { moneyRange } from "@/lib/financial-intelligence/contracts";

function byId(id: string) {
  const fixture = DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1.find((item) => item.decision_id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}

test("deterministically selects required decision modes from fixture inputs", () => {
  const expected: Record<string, DecisionUnderUncertaintyModeV1> = {
    "duu-cold-start-collector-room": "EXPERIMENT_FIRST",
    "duu-proxy-prestige-signal": "BOUNDED_UNCERTAINTY",
    "duu-cheap-experiment": "EXPERIMENT_FIRST",
    "duu-option-preserving": "OPTION_PRESERVING",
    "duu-unbounded-downside-refusal": "DEFER_FOR_SAFETY"
  };

  for (const fixture of DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1) {
    assert.equal(selectDecisionModeV1(fixture), expected[fixture.decision_id]);
    assert.equal(buildDecisionUnderUncertaintyPlanV1(fixture).DECISION_MODE, expected[fixture.decision_id]);
  }
});

test("supports high-evidence and human-judgment modes in the same adapter", () => {
  const base = byId("duu-cheap-experiment");
  const highEvidence: DecisionUnderUncertaintyInputV1 = {
    ...base,
    decision_id: "duu-high-evidence-direct",
    DATA_COVERAGE: "COMPLETE",
    CRITICAL_UNKNOWNS: [],
    CHEAPEST_CREDIBLE_TEST: null,
    VALUE_OF_INFORMATION: "LOW",
    DIRECT_EVIDENCE_REFS: [
      ...base.DIRECT_EVIDENCE_REFS,
      { ref_id: "direct-access-confirmed", label: "Direct access confirmed", kind: "DIRECT", provenance: "MANUAL_FIXTURE", direct_evidence: true, notes: "Direct fixture evidence." }
    ]
  };
  const humanJudgment: DecisionUnderUncertaintyInputV1 = {
    ...base,
    decision_id: "duu-human-judgment-required",
    human_judgment_required: true,
    CHEAPEST_CREDIBLE_TEST: null,
    VALUE_OF_INFORMATION: "MEDIUM"
  };

  assert.equal(selectDecisionModeV1(highEvidence), "HIGH_EVIDENCE");
  assert.equal(buildDecisionUnderUncertaintyPlanV1(highEvidence).CONFIDENCE_RANGE.high, "strongly_supported");
  assert.equal(selectDecisionModeV1(humanJudgment), "HUMAN_JUDGMENT_REQUIRED");
});

test("proxy and prior evidence never masquerade as direct evidence or raise confidence above possible", () => {
  const proxy = buildDecisionUnderUncertaintyPlanV1(byId("duu-proxy-prestige-signal"));

  assert.equal(proxy.dashboard_flags.uses_proxy_or_prior, true);
  assert.equal(proxy.dashboard_flags.has_direct_evidence, false);
  assert.equal(proxy.dashboard_flags.proxy_masquerades_as_direct, false);
  assert.ok(proxy.PROXY_OR_ANALOG_EVIDENCE.every((item) => item.direct_evidence === false && item.kind !== "DIRECT"));
  assert.ok(proxy.PRIOR_OR_BASE_RATE_USED.every((item) => item.direct_evidence === false && item.kind === "PRIOR_BASE_RATE"));
  assert.equal(proxy.CONFIDENCE_RANGE.high, "possible");
  assert.match(proxy.CONFIDENCE_RANGE.cap_reason, /Proxy, analog, and prior evidence/);
});

test("UNKNOWN coverage and money ranges remain explicit rather than becoming zero", () => {
  const cold = buildDecisionUnderUncertaintyPlanV1(byId("duu-cold-start-collector-room"));

  assert.equal(cold.DATA_COVERAGE, "UNKNOWN");
  assert.equal(cold.dashboard_flags.unknowns_explicit, true);
  assert.equal(cold.DOWNSIDE_BOUND.estimated_loss_range.currency, "UNKNOWN");
  assert.equal(cold.DOWNSIDE_BOUND.estimated_loss_range.low_cents, null);
  assert.equal(cold.DOWNSIDE_BOUND.estimated_loss_range.high_cents, null);
  assert.notEqual(cold.DOWNSIDE_BOUND.estimated_loss_range.low_cents, 0);
  assert.ok(cold.CRITICAL_UNKNOWNS.includes("Direct economics"));
});

test("unbounded downside refuses viable action and blocks irreversible action", () => {
  const refusal = buildDecisionUnderUncertaintyPlanV1(byId("duu-unbounded-downside-refusal"));

  assert.equal(refusal.DECISION_MODE, "DEFER_FOR_SAFETY");
  assert.equal(refusal.CONFIDENCE_RANGE.high, "insufficient_evidence");
  assert.equal(refusal.dashboard_flags.blocks_irreversible_action, true);
  assert.match(refusal.BEST_VIABLE_PLAN_NOW, /Do not act/);
  assert.equal(refusal.DOWNSIDE_BOUND.bounded, false);
});

test("confidence caps rise only when direct evidence and bounded downside are present", () => {
  const base = byId("duu-cheap-experiment");
  const directPartial = buildDecisionUnderUncertaintyPlanV1(base);
  const directComplete = buildDecisionUnderUncertaintyPlanV1({
    ...base,
    DATA_COVERAGE: "COMPLETE",
    CRITICAL_UNKNOWNS: [],
    CHEAPEST_CREDIBLE_TEST: null,
    VALUE_OF_INFORMATION: "LOW",
    DOWNSIDE_BOUND: {
      bounded: true,
      severity: "LOW",
      notes: ["Known zero-cost fixture."],
      estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] })
    }
  });

  assert.equal(directPartial.CONFIDENCE_RANGE.high, "likely");
  assert.equal(directComplete.CONFIDENCE_RANGE.high, "strongly_supported");
});

test("all exported plan fixtures are deterministic and dashboard-consumable", () => {
  assert.deepEqual(
    DECISION_UNDER_UNCERTAINTY_PLAN_FIXTURES_V1.map((item) => item.decision_id),
    DECISION_UNDER_UNCERTAINTY_INPUT_FIXTURES_V1.map((item) => item.decision_id)
  );
  assert.ok(DECISION_UNDER_UNCERTAINTY_PLAN_FIXTURES_V1.every((item) => item.contract_version === "decision_under_uncertainty_v1"));
  assert.ok(DECISION_UNDER_UNCERTAINTY_PLAN_FIXTURES_V1.every((item) => item.TRIGGERS_TO_REVISE.length > 0));
});

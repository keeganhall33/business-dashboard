import assert from "node:assert/strict";
import test from "node:test";

import { buildUncertaintyDecisionViewModelV1, selectUncertaintyDecisionModeV1 } from "@/lib/decision-intelligence/uncertainty/adapter";
import { UNCERTAINTY_DECISION_INPUT_FIXTURES_V1, UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1 } from "@/lib/decision-intelligence/uncertainty/fixtures";
import type { UncertaintyDecisionInputV1, UncertaintyDecisionModeV1 } from "@/lib/decision-intelligence/uncertainty/contracts";
import { moneyRange } from "@/lib/financial-intelligence/contracts";

function byId(id: string) {
  const fixture = UNCERTAINTY_DECISION_INPUT_FIXTURES_V1.find((item) => item.decision_id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}

test("deterministic fixtures cover bounded uncertainty, experiment-first, option-preserving, and defer-for-safety", () => {
  const expected: Record<string, UncertaintyDecisionModeV1> = {
    "uncertainty-bounded-private-room": "BOUNDED_UNCERTAINTY",
    "uncertainty-experiment-first-script": "EXPERIMENT_FIRST",
    "uncertainty-option-preserving-checklist": "OPTION_PRESERVING",
    "uncertainty-safety-defer-public-commitment": "DEFER_FOR_SAFETY"
  };

  for (const fixture of UNCERTAINTY_DECISION_INPUT_FIXTURES_V1) {
    assert.equal(selectUncertaintyDecisionModeV1(fixture), expected[fixture.decision_id]);
    assert.equal(buildUncertaintyDecisionViewModelV1(fixture).decision_mode, expected[fixture.decision_id]);
  }
});

test("adapter supports all seven bounded modes without shared ranking policy edits", () => {
  const base = byId("uncertainty-experiment-first-script");
  const modeInputs: Record<UncertaintyDecisionModeV1, UncertaintyDecisionInputV1> = {
    HIGH_EVIDENCE: {
      ...base,
      decision_id: "uncertainty-high-evidence",
      data_coverage: "COMPLETE",
      critical_unknowns: [],
      value_of_information: "LOW",
      cheapest_credible_test: null
    },
    BOUNDED_UNCERTAINTY: byId("uncertainty-bounded-private-room"),
    EXPERIMENT_FIRST: byId("uncertainty-experiment-first-script"),
    OPTION_PRESERVING: byId("uncertainty-option-preserving-checklist"),
    RESEARCH_FIRST: {
      ...base,
      decision_id: "uncertainty-research-first",
      data_coverage: "UNKNOWN",
      critical_unknowns: ["Relevant buyer evidence", "Economics"],
      proxy_or_analog_evidence: [],
      prior_or_base_rate_evidence: [],
      direct_evidence_refs: [],
      value_of_information: "MEDIUM",
      cheapest_credible_test: null,
      reversibility: "UNKNOWN"
    },
    HUMAN_JUDGMENT_REQUIRED: {
      ...base,
      decision_id: "uncertainty-human-judgment-required",
      human_judgment_required: true,
      value_of_information: "MEDIUM",
      cheapest_credible_test: null
    },
    DEFER_FOR_SAFETY: byId("uncertainty-safety-defer-public-commitment")
  };

  for (const [mode, input] of Object.entries(modeInputs) as [UncertaintyDecisionModeV1, UncertaintyDecisionInputV1][]) {
    assert.equal(selectUncertaintyDecisionModeV1(input), mode);
  }
});

test("proxy, analog, and prior evidence cannot masquerade as direct evidence", () => {
  const viewModel = buildUncertaintyDecisionViewModelV1(byId("uncertainty-bounded-private-room"));

  assert.equal(viewModel.dashboard_flags.uses_proxy_or_analog_evidence, true);
  assert.equal(viewModel.dashboard_flags.has_direct_evidence, false);
  assert.equal(viewModel.confidence_inputs.proxy_evidence_cannot_masquerade_as_direct, true);
  assert.ok(viewModel.evidence.proxy_or_analog.every((item) => item.direct_evidence === false && item.kind !== "DIRECT"));
  assert.ok(viewModel.evidence.prior_or_base_rate.every((item) => item.direct_evidence === false && item.kind === "PRIOR_BASE_RATE"));
  assert.equal(viewModel.confidence_range.high, "possible");
  assert.match(viewModel.confidence_range.cap_reason, /cannot raise confidence above possible/);
});

test("missing data lowers confidence and preserves unknown money instead of becoming zero or false", () => {
  const viewModel = buildUncertaintyDecisionViewModelV1(byId("uncertainty-bounded-private-room"));

  assert.equal(viewModel.confidence_inputs.missing_data_lowers_confidence, true);
  assert.equal(viewModel.dashboard_flags.unknowns_explicit, true);
  assert.ok(viewModel.critical_unknowns.includes("Direct event economics"));
  assert.equal(viewModel.downside_bound.estimated_loss_range.currency, "UNKNOWN");
  assert.equal(viewModel.downside_bound.estimated_loss_range.low_cents, null);
  assert.equal(viewModel.downside_bound.estimated_loss_range.high_cents, null);
  assert.notEqual(viewModel.downside_bound.estimated_loss_range.low_cents, 0);
});

test("defer-for-safety refuses viable action and preserves VOI, downside, reversibility, and mind-change triggers", () => {
  const viewModel = buildUncertaintyDecisionViewModelV1(byId("uncertainty-safety-defer-public-commitment"));

  assert.equal(viewModel.decision_mode, "DEFER_FOR_SAFETY");
  assert.equal(viewModel.confidence_range.high, "insufficient_evidence");
  assert.equal(viewModel.dashboard_flags.blocks_irreversible_or_unsafe_action, true);
  assert.match(viewModel.best_viable_plan_now, /Do not act/);
  assert.equal(viewModel.value_of_information, "CRITICAL");
  assert.equal(viewModel.downside_bound.bounded, false);
  assert.equal(viewModel.reversibility, "IRREVERSIBLE");
  assert.ok(viewModel.what_would_change_my_mind.length >= 2);
});

test("direct complete evidence raises confidence only when downside is bounded", () => {
  const base = byId("uncertainty-experiment-first-script");
  const directComplete = buildUncertaintyDecisionViewModelV1({
    ...base,
    decision_id: "uncertainty-direct-complete",
    data_coverage: "COMPLETE",
    critical_unknowns: [],
    value_of_information: "LOW",
    cheapest_credible_test: null,
    downside_bound: {
      bounded: true,
      severity: "LOW",
      notes: ["Known zero-cost fixture."],
      estimated_loss_range: moneyRange({ low_cents: 0, high_cents: 0, coverage_state: "COMPLETE", evidence_refs: ["no-spend-fixture"] })
    }
  });

  assert.equal(directComplete.decision_mode, "HIGH_EVIDENCE");
  assert.equal(directComplete.confidence_range.high, "strongly_supported");
});

test("exported viable-plan fixtures are deterministic and dashboard-consumable", () => {
  assert.deepEqual(
    UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.map((item) => item.decision_id),
    UNCERTAINTY_DECISION_INPUT_FIXTURES_V1.map((item) => item.decision_id)
  );
  assert.ok(UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.every((item) => item.contract_version === "decision_uncertainty_adapter_v1"));
  assert.ok(UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.every((item) => item.what_would_change_my_mind.length > 0));
  assert.ok(UNCERTAINTY_DECISION_VIEW_MODEL_FIXTURES_V1.every((item) => item.dashboard_flags.keegan_action_required === false));
});

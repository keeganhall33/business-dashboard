import assert from "node:assert/strict";
import test from "node:test";

import {
  hasKnownCapitalAllocationMoneyV1,
  orderCapitalAllocationAlternativesV1,
  scoreCapitalAllocationAlternativeV1
} from "@/lib/financial-intelligence/capital-allocation/contracts";
import {
  CAPITAL_ALLOCATION_BASE_FIXTURE_V1,
  CAPITAL_ALLOCATION_FIXTURES_V1,
  CAPITAL_ALLOCATION_HIGH_TIME_FIXTURE_V1,
  CAPITAL_ALLOCATION_LOW_CASH_FIXTURE_V1,
  CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1
} from "@/lib/financial-intelligence/capital-allocation/fixtures";
import { toCapitalAllocationViewModelV1 } from "@/lib/financial-intelligence/capital-allocation/view-model";

test("CapitalAllocationAssessmentV1 compares three scarce-resource alternatives", () => {
  const assessment = CAPITAL_ALLOCATION_BASE_FIXTURE_V1;

  assert.equal(assessment.contract_version, "capital_allocation_assessment_v1.0");
  assert.equal(assessment.alternatives.length, 3);
  assert.deepEqual(
    assessment.alternatives.map((item) => item.kind).sort(),
    ["HIGH_CASH_LOW_TIME_GROWTH", "HIGH_TIME_ORIGINAL_COMMISSION", "PARTNERSHIP_LICENSING_STRATEGIC"].sort()
  );
  for (const alternative of assessment.alternatives) {
    assert.ok(alternative.direct_financial_range);
    assert.ok(alternative.capital_required);
    assert.ok(alternative.creative_time_burden);
    assert.ok(alternative.payback_window);
    assert.ok(alternative.liquidity_impact);
    assert.ok(alternative.reversibility);
    assert.equal(alternative.strategic_value_not_monetized.not_monetized, true);
    assert.ok(alternative.learning_value.summary);
    assert.ok(alternative.opportunity_cost.notes.length > 0);
    assert.ok(alternative.confidence.reasons.length > 0);
    assert.ok(alternative.next_safe_action);
  }
});

test("direct financial ranges stay separate from non-cash strategic value", () => {
  const strategic = CAPITAL_ALLOCATION_BASE_FIXTURE_V1.alternatives.find((item) => item.alternative_id === "allocation-partnership-licensing-strategic");
  assert.ok(strategic);

  assert.equal(strategic.direct_financial_range.high_cents, -70000);
  assert.deepEqual(strategic.strategic_value_not_monetized.notes, ["Institutional authority signal", "Premium positioning proof point"]);
  assert.equal(CAPITAL_ALLOCATION_BASE_FIXTURE_V1.guardrails.direct_financial_and_strategic_value_separate, true);
});

test("cash and creative-time constraints can alter recommendation", () => {
  assert.equal(CAPITAL_ALLOCATION_BASE_FIXTURE_V1.recommended_alternative_id, "allocation-high-cash-low-time-growth");
  assert.equal(CAPITAL_ALLOCATION_LOW_CASH_FIXTURE_V1.recommended_alternative_id, "allocation-partnership-licensing-strategic");
  assert.equal(CAPITAL_ALLOCATION_HIGH_TIME_FIXTURE_V1.recommended_alternative_id, "allocation-high-time-original-commission");

  const reordered = orderCapitalAllocationAlternativesV1(CAPITAL_ALLOCATION_BASE_FIXTURE_V1.alternatives, CAPITAL_ALLOCATION_BASE_FIXTURE_V1.constraints);
  assert.equal(reordered[0]?.alternative_id, CAPITAL_ALLOCATION_BASE_FIXTURE_V1.recommended_alternative_id);
  assert.ok(
    scoreCapitalAllocationAlternativeV1(reordered[0]!, CAPITAL_ALLOCATION_BASE_FIXTURE_V1.constraints) >
      scoreCapitalAllocationAlternativeV1(reordered[2]!, CAPITAL_ALLOCATION_BASE_FIXTURE_V1.constraints)
  );
});

test("UNKNOWN cost data blocks fake profit precision", () => {
  const unknown = CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1.alternatives.find((item) => item.alternative_id === "allocation-unknown-cost-growth");
  assert.ok(unknown);

  assert.equal(unknown.direct_financial_range.currency, "UNKNOWN");
  assert.equal(unknown.direct_financial_range.low_cents, null);
  assert.equal(unknown.direct_financial_range.high_cents, null);
  assert.equal(unknown.capital_required.currency, "UNKNOWN");
  assert.equal(unknown.truth_state, "UNKNOWN");
  assert.equal(unknown.recommendation, "WAIT_FOR_EVIDENCE");
  assert.equal(hasKnownCapitalAllocationMoneyV1(unknown.direct_financial_range), false);
  assert.equal(CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1.guardrails.unknown_cost_blocks_profit_precision, true);
  assert.notEqual(CAPITAL_ALLOCATION_UNKNOWN_COST_FIXTURE_V1.recommended_alternative_id, unknown.alternative_id);
});

test("dashboard and strategy view model is compact, deterministic, and read-only", () => {
  const first = toCapitalAllocationViewModelV1(CAPITAL_ALLOCATION_BASE_FIXTURE_V1);
  const second = toCapitalAllocationViewModelV1(CAPITAL_ALLOCATION_BASE_FIXTURE_V1);

  assert.deepEqual(first, second);
  assert.equal(first.view_version, "capital_allocation_view_v1.0");
  assert.equal(first.keegan_action_required, "NO");
  assert.equal(first.guardrails.no_live_account_connection, true);
  assert.equal(first.guardrails.no_money_movement_or_spend_change, true);
  assert.equal(first.rows.length, 3);
  assert.equal(first.rows[0]?.alternative_id, CAPITAL_ALLOCATION_BASE_FIXTURE_V1.recommended_alternative_id);
});

test("fixture bundle ordering is deterministic", () => {
  assert.deepEqual(
    CAPITAL_ALLOCATION_FIXTURES_V1.map((item) => item.assessment_id),
    [
      "capital-allocation-base-cash-strong-time-constrained",
      "capital-allocation-high-creative-time",
      "capital-allocation-low-cash-buffer",
      "capital-allocation-unknown-cost-blocks-profit"
    ]
  );
});

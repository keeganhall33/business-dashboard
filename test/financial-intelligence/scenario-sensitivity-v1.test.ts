import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENARIO_SENSITIVITY_BASE_FIXTURE_V1,
  SCENARIO_SENSITIVITY_FIXTURES_V1,
  SCENARIO_SENSITIVITY_UNKNOWN_COST_FIXTURE_V1
} from "@/lib/financial-intelligence/scenario-sensitivity/fixtures";

test("ScenarioSensitivityV1 varies cash reserve, time burden, revenue range, and cost uncertainty", () => {
  const sensitivity = SCENARIO_SENSITIVITY_BASE_FIXTURE_V1;

  assert.equal(sensitivity.contract_version, "scenario_sensitivity_v1.0");
  assert.deepEqual(
    sensitivity.scenarios.map((scenario) => scenario.scenario_id),
    ["base", "low-cash-high-cost", "high-time-upside", "unknown-cost"]
  );
  assert.equal(sensitivity.scenarios[1]?.cash_reserve.low_cents, 2976000);
  assert.equal(sensitivity.scenarios[2]?.creative_time_available.high_hours, 329);
  assert.equal(sensitivity.scenarios[2]?.revenue_multiplier, 1.45);
  assert.equal(sensitivity.scenarios[3]?.cost_multiplier, "UNKNOWN");
});

test("recommendation stability changes when material assumptions move", () => {
  const sensitivity = SCENARIO_SENSITIVITY_BASE_FIXTURE_V1;
  const recommendations = sensitivity.scenarios.map((scenario) => scenario.recommended_alternative_id);

  assert.equal(sensitivity.base_recommended_alternative_id, "allocation-high-cash-low-time-growth");
  assert.ok(recommendations.includes("allocation-partnership-licensing-strategic"));
  assert.ok(recommendations.includes("allocation-high-time-original-commission"));
  assert.equal(sensitivity.RECOMMENDATION_STABILITY, "BLOCKED_BY_UNKNOWN");
  assert.ok(sensitivity.ASSUMPTIONS_THAT_MATTER.includes("cash reserve versus minimum buffer"));
  assert.ok(sensitivity.ASSUMPTIONS_THAT_MATTER.includes("cost and capital requirement uncertainty"));
});

test("UNKNOWN cost inputs block fake break-even precision", () => {
  const unknownScenario = SCENARIO_SENSITIVITY_BASE_FIXTURE_V1.scenarios.find((scenario) => scenario.scenario_id === "unknown-cost");
  assert.ok(unknownScenario);

  assert.equal(unknownScenario.recommended_alternative_id, null);
  assert.equal(unknownScenario.direct_financial_range.currency, "UNKNOWN");
  assert.match(unknownScenario.break_even_change, /UNKNOWN cost or revenue input blocks break-even precision/);
  assert.ok(SCENARIO_SENSITIVITY_BASE_FIXTURE_V1.UNKNOWN.some((item) => item.includes("UNKNOWN cost/revenue")));
});

test("strategic and prestige value remain separate from direct dollars", () => {
  const scenario = SCENARIO_SENSITIVITY_BASE_FIXTURE_V1.scenarios.find((item) => item.recommended_alternative_id === "allocation-partnership-licensing-strategic");
  assert.ok(scenario);

  assert.equal(scenario.strategic_value_not_monetized.not_monetized, true);
  assert.ok(scenario.strategic_value_not_monetized.notes.includes("Institutional authority signal"));
  assert.equal(SCENARIO_SENSITIVITY_BASE_FIXTURE_V1.guardrails.strategic_prestige_value_not_dollarized, true);
});

test("UNKNOWN source assessment remains UNKNOWN and deterministic", () => {
  const first = SCENARIO_SENSITIVITY_UNKNOWN_COST_FIXTURE_V1;
  const second = SCENARIO_SENSITIVITY_FIXTURES_V1.find((item) => item.sensitivity_id === first.sensitivity_id);

  assert.ok(second);
  assert.deepEqual(first, second);
  assert.equal(first.truth_state, "UNKNOWN");
  assert.equal(first.guardrails.unknown_cost_blocks_fake_precision, true);
});

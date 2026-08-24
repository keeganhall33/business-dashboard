import assert from "node:assert/strict";
import test from "node:test";

import { buildStrategicAdvantageDecisionLensV1 } from "@/lib/strategic-advantage/decision-lens/adapter";
import { STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1 } from "@/lib/strategic-advantage/decision-lens/fixtures";
import { STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1 } from "@/lib/strategic-advantage/fixtures";
import { STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1, STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1 } from "@/lib/strategic-trajectory/fixtures";
import { toStrategicTrajectoryViewModelV1 } from "@/lib/strategic-trajectory/view-model";

function assessment(id: string) {
  const item = STRATEGIC_ADVANTAGE_ASSESSMENT_FIXTURES_V1.find((fixture) => fixture.assessment_id === id);
  assert.ok(item, `missing assessment ${id}`);
  return item;
}

test("reversible compounding bet shows what compounds, what is hard to copy, tradeoff, and next move", () => {
  const lens = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-high-upside-reversible-learning-option"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1)
  });

  assert.equal(lens.recommendation, "PURSUE_OPTION");
  assert.equal(lens.what_compounds.advantage.level, "HIGH");
  assert.match(lens.what_compounds.trajectory_asset_created, /premium access routes/);
  assert.equal(lens.what_is_hard_to_copy.information_advantage.level, "VERY_HIGH");
  assert.ok(lens.what_the_decision_gives_up.advantage_tradeoffs.some((item) => /reporting cleanup/i.test(item)));
  assert.match(lens.next_smallest_high_leverage_move, /private signal test/);
  assert.equal(lens.dashboard_flags.dashboard_consumable, true);
  assert.equal(lens.dashboard_flags.no_scoring_engine_added, true);
  assert.equal(lens.keegan_action_required, "NO");
});

test("prestige network option keeps direct economics UNKNOWN instead of fake-dollarizing qualitative value", () => {
  const lens = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-prestige-network-uncertain-economics"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1)
  });

  assert.equal(lens.recommendation, "LEARN_FIRST");
  assert.equal(lens.qualitative_value_guardrail.expected_value_currency, "UNKNOWN");
  assert.equal(lens.qualitative_value_guardrail.prestige_network_value_not_dollarized, true);
  assert.equal(lens.what_is_hard_to_copy.network_effect.level, "VERY_HIGH");
  assert.match(lens.biggest_uncertainty, /decision-makers/);
  assert.match(lens.fog_of_war.join(" "), /UNKNOWN direct dollars/);
});

test("attractive upside cannot hide unacceptable risk-of-ruin or capacity conflict", () => {
  const lens = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-reject-risk-of-ruin-capacity-conflict"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1)
  });
  const ruinSignal = lens.component_signals.find((signal) => signal.component === "RISK_OF_RUIN");
  const capacitySignal = lens.component_signals.find((signal) => signal.component === "CAPACITY_FIT");

  assert.equal(lens.recommendation, "REJECT");
  assert.equal(lens.ruin_or_capacity_guardrail.blocks_upside_override, true);
  assert.equal(lens.ruin_or_capacity_guardrail.risk_of_ruin.level, "UNACCEPTABLE");
  assert.equal(lens.ruin_or_capacity_guardrail.capacity_fit.level, "UNACCEPTABLE");
  assert.equal(ruinSignal?.supports_recommendation, false);
  assert.equal(capacitySignal?.supports_recommendation, false);
  assert.match(lens.what_to_ignore_or_deprioritize.join(" "), /Headline revenue/);
});

test("component disagreement remains visible rather than collapsing to a single score", () => {
  const lens = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-high-revenue-weak-defensibility-poor-cost"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1)
  });
  const supportive = lens.component_signals.filter((signal) => signal.supports_recommendation);
  const challenging = lens.component_signals.filter((signal) => !signal.supports_recommendation);

  assert.equal(lens.component_disagreement_visible, true);
  assert.equal(lens.dashboard_flags.component_disagreement_visible, true);
  assert.ok(supportive.length > 0);
  assert.ok(challenging.length > 0);
  assert.equal(lens.component_signals.some((signal) => signal.component === "DEFENSIBILITY" && signal.level === "LOW"), true);
  assert.equal(lens.component_signals.some((signal) => signal.component === "CAPACITY_FIT" && signal.level === "HIGH"), true);
});

test("new fact changes preferred next move while preserving prior rationale", () => {
  const base = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-prestige-network-uncertain-economics"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_BASE_FIXTURE_V1)
  });
  const revised = buildStrategicAdvantageDecisionLensV1({
    assessment: assessment("advantage-prestige-network-uncertain-economics"),
    trajectory: toStrategicTrajectoryViewModelV1(STRATEGIC_TRAJECTORY_REVISED_FIXTURE_V1)
  });

  assert.equal(base.preferred_path.path_id, "path-collector-room-proof");
  assert.equal(revised.preferred_path.path_id, "path-institutional-prestige-wedge");
  assert.notEqual(base.next_smallest_high_leverage_move, revised.next_smallest_high_leverage_move);
  assert.equal(revised.revision.history.length, 1);
  assert.equal(revised.revision.preserves_prior_rationale, true);
  assert.match(revised.revision.history[0]?.previous_reason ?? "", /Preferred while institutional access is UNKNOWN/);
  assert.match(revised.revision.history[0]?.revision_reason ?? "", /Confirmed institutional access/);
});

test("decision lens fixture export is deterministic and dashboard consumable", () => {
  const first = JSON.stringify(STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1);
  const second = JSON.stringify([...STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1]);

  assert.equal(first, second);
  assert.ok(STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1.every((lens) => lens.view_version === "strategic_advantage_decision_lens_v1.0"));
  assert.ok(STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1.every((lens) => lens.component_signals.length === 8));
  assert.ok(STRATEGIC_ADVANTAGE_DECISION_LENS_FIXTURES_V1.every((lens) => lens.keegan_action_required === "NO"));
});

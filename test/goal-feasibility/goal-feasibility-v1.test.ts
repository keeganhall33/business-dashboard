import assert from "node:assert/strict";
import test from "node:test";

import { toGoalFeasibilityExecutiveViewModelV1 } from "@/lib/goal-feasibility/executive-view-model";
import {
  GOAL_FEASIBILITY_BASE_FIXTURE_V1,
  GOAL_FEASIBILITY_FIXTURES_V1,
  GOAL_FEASIBILITY_LICENSING_UPSIDE_FIXTURE_V1
} from "@/lib/goal-feasibility/fixtures";

test("goal feasibility fixture exposes the required V1 fields and three materially different paths", () => {
  const snapshot = GOAL_FEASIBILITY_BASE_FIXTURE_V1;

  assert.equal(snapshot.contract_version, "goal_feasibility_v1.0");
  assert.deepEqual(
    snapshot.PATHS.map((path) => path.strategy_kind).sort(),
    ["DIVERSIFIED_CREATIVE_ENTERPRISE", "HIGH_END_ORIGINAL_ART_CONCENTRATION", "LICENSING_IP_PLATFORM_LEVERAGE"].sort()
  );

  for (const path of snapshot.PATHS) {
    assert.ok(path.TARGET_STATE);
    assert.ok(path.FEASIBILITY_CLASS);
    assert.ok(path.REQUIRED_SCALE_RANGE);
    assert.ok(path.CURRENT_TRAJECTORY.summary);
    assert.ok(path.GAP_TO_TARGET.notes.length > 0);
    assert.ok(path.PATHWAYS.length > 0);
    assert.ok(path.REQUIRED_ASSETS.length > 0);
    assert.ok(path.CAPACITY_CONSTRAINTS.length > 0);
    assert.ok(path.CAPITAL_OR_ECONOMIC_ASSUMPTIONS.length > 0);
    assert.ok(path.MILESTONE_LADDER.length > 0);
    assert.ok(path.BIGGEST_BOTTLENECK);
    assert.equal(path.PHASE_CHANGE_OPPORTUNITY.not_guaranteed, true);
    assert.equal(path.NEXT_HIGH_LEVERAGE_MOVE.requires_keegan_approval, false);
    assert.ok(path.RISK_OF_RUIN.level);
    assert.ok(path.CONFIDENCE.reasons.length > 0);
    assert.ok(path.WHAT_WOULD_CHANGE_THE_PATH.length > 0);
  }
});

test("enterprise value, revenue, cash flow, and personal equity remain distinct with UNKNOWN where unsupported", () => {
  const enterprise = GOAL_FEASIBILITY_BASE_FIXTURE_V1.PATHS.find((path) => path.path_id === "path-diversified-creative-enterprise");
  assert.ok(enterprise);

  assert.equal(enterprise.GAP_TO_TARGET.enterprise_value_range.currency, "UNKNOWN");
  assert.equal(enterprise.GAP_TO_TARGET.enterprise_value_range.low_cents, null);
  assert.equal(enterprise.GAP_TO_TARGET.annual_revenue_range.currency, "USD");
  assert.equal(enterprise.GAP_TO_TARGET.cash_flow_range.currency, "UNKNOWN");
  assert.equal(enterprise.GAP_TO_TARGET.personal_equity_range.currency, "UNKNOWN");
  assert.match(enterprise.GAP_TO_TARGET.notes.join(" "), /Revenue and cash flow must stay distinct from personal equity/i);
});

test("artist-production-only path is capacity constrained and cannot be treated as infinite scale", () => {
  const constrained = GOAL_FEASIBILITY_BASE_FIXTURE_V1.capacity_constrained_case;
  const originalPath = GOAL_FEASIBILITY_BASE_FIXTURE_V1.PATHS.find((path) => path.path_id === constrained.path_id);

  assert.ok(originalPath);
  assert.equal(constrained.artist_production_only, true);
  assert.equal(constrained.can_be_treated_as_infinite_scale, false);
  assert.equal(constrained.maximum_originals_per_year, 6);
  assert.equal(originalPath.CURRENT_TRAJECTORY.state, "CAPACITY_CONSTRAINED");
  assert.equal(originalPath.CAPACITY_CONSTRAINTS[0]?.severity, "BLOCKING");
  assert.match(constrained.why_not_scalable.join(" "), /scarce Keegan studio hours/i);
});

test("fixtures reject guaranteed fame or wealth language and preserve qualitative prestige/network effects", () => {
  const serialized = JSON.stringify(GOAL_FEASIBILITY_FIXTURES_V1).toLowerCase();

  assert.equal(GOAL_FEASIBILITY_BASE_FIXTURE_V1.guardrails.guaranteed_fame_or_wealth_language_allowed, false);
  assert.equal(GOAL_FEASIBILITY_BASE_FIXTURE_V1.guardrails.aspiration_is_not_forecast, true);
  assert.equal(GOAL_FEASIBILITY_BASE_FIXTURE_V1.guardrails.prestige_network_effects_are_qualitative, true);
  assert.doesNotMatch(serialized, /\bguaranteed\b.*\b(fame|wealth|rich|famous)\b/);
  assert.doesNotMatch(serialized, /\bwill become\b.*\b(famous|wealthy|rich)\b/);

  const qualitativeAssumptions = GOAL_FEASIBILITY_BASE_FIXTURE_V1.PATHS.flatMap((path) =>
    path.CAPITAL_OR_ECONOMIC_ASSUMPTIONS.filter((assumption) => assumption.qualitative_only)
  );
  assert.ok(qualitativeAssumptions.length >= 2);
  assert.ok(qualitativeAssumptions.every((assumption) => assumption.value_range.currency === "UNKNOWN"));
});

test("path ordering changes when assumptions change", () => {
  assert.deepEqual(GOAL_FEASIBILITY_BASE_FIXTURE_V1.PREFERRED_PATH_ORDER, [
    "path-diversified-creative-enterprise",
    "path-licensing-ip-platform-leverage",
    "path-high-end-original-art-concentration"
  ]);
  assert.deepEqual(GOAL_FEASIBILITY_LICENSING_UPSIDE_FIXTURE_V1.PREFERRED_PATH_ORDER, [
    "path-licensing-ip-platform-leverage",
    "path-diversified-creative-enterprise",
    "path-high-end-original-art-concentration"
  ]);
});

test("executive view model is deterministic and dashboard-consumable", () => {
  const first = toGoalFeasibilityExecutiveViewModelV1(GOAL_FEASIBILITY_BASE_FIXTURE_V1);
  const second = toGoalFeasibilityExecutiveViewModelV1(GOAL_FEASIBILITY_BASE_FIXTURE_V1);

  assert.deepEqual(first, second);
  assert.equal(first.view_version, "goal_feasibility_executive_view_v1.0");
  assert.equal(first.keegan_action_required, "NO");
  assert.equal(first.top_path.path_id, "path-diversified-creative-enterprise");
  assert.deepEqual(
    first.milestone_ladder.map((milestone) => milestone.order),
    [1, 2, 3]
  );
  assert.match(first.capacity_warning, /cannot be treated like software distribution/i);
});

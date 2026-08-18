import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1, getGoalsPortfolioCapacityFixtureBundleV1 } from "@/lib/goals-portfolio-capacity/fixtures";
import { toExecutiveGoalsCapacityViewModelV1, toExecutiveGoalsCapacityViewModelsV1 } from "@/lib/goals-portfolio-capacity/executive-view-model";

describe("goals portfolio capacity snapshot v1", () => {
  it("returns deterministic fixture ordering and required executive portfolio shape", () => {
    assert.deepEqual(
      GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1.map((item) => item.snapshot_id),
      [
        "goals-capacity-healthy-portfolio",
        "goals-capacity-high-option-weak-economics",
        "goals-capacity-overload-conflict"
      ]
    );
    assert.equal(JSON.stringify(getGoalsPortfolioCapacityFixtureBundleV1()), JSON.stringify(getGoalsPortfolioCapacityFixtureBundleV1()));

    const healthy = GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1[0];
    assert.ok(healthy.GOALS.length >= 3);
    assert.ok(healthy.ACTIVE_BETS.length >= 2);
    assert.equal(healthy.NEXT_PORTFOLIO_ACTION.requires_keegan_approval, false);
    assert.equal(healthy.ACTIVE_BETS[0].NEXT_PORTFOLIO_ACTION.requires_keegan_approval, false);
  });

  it("preserves qualitative prestige network and authority objectives without fabricated dollars", () => {
    const highOption = GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1.find((item) => item.snapshot_id === "goals-capacity-high-option-weak-economics");
    assert.ok(highOption);
    const bet = highOption.ACTIVE_BETS.find((item) => item.bet_id === "bet-museum-authority-study");
    assert.ok(bet);

    assert.equal(bet.EXPECTED_UPSIDE.qualitative_objectives.every((objective) => objective.not_monetized), true);
    assert.deepEqual(
      bet.EXPECTED_UPSIDE.qualitative_objectives.map((objective) => objective.kind),
      ["AUTHORITY", "PRESTIGE", "NETWORK"]
    );
    assert.equal(bet.EXPECTED_UPSIDE.direct_financial_range.high_cents, 50000);
    assert.equal(bet.EXPECTED_DOWNSIDE.cash_risk_range.low_cents, 120000);
    assert.ok(bet.WHAT_TO_IGNORE.includes("Direct revenue ranking alone"));
  });

  it("overload cannot be hidden by upside", () => {
    const overload = GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1.find((item) => item.snapshot_id === "goals-capacity-overload-conflict");
    assert.ok(overload);
    assert.equal(overload.ATTENTION_CAPACITY_LOAD.state, "OVERLOADED");
    assert.equal(overload.conflicts[0].severity, "BLOCKING");
    assert.equal(overload.conflicts[0].cannot_be_hidden_by_upside, true);
    assert.equal(overload.ACTIVE_BETS.some((bet) => bet.EXPECTED_UPSIDE.qualitative_objectives.length > 0), true);

    const view = toExecutiveGoalsCapacityViewModelV1(overload);
    assert.equal(view.overload_or_conflict.visible, true);
    assert.equal(view.overload_or_conflict.severity, "BLOCKING");
    assert.match(view.overload_or_conflict.summary, /exceed available/);
    assert.equal(view.next_portfolio_action, "Defer one active build before adding anything else");
    assert.equal(view.keegan_action_required, "NO");
  });

  it("UNKNOWN resource inputs do not become zero", () => {
    const highOption = GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1.find((item) => item.snapshot_id === "goals-capacity-high-option-weak-economics");
    assert.ok(highOption);
    const unknownBet = highOption.ACTIVE_BETS.find((item) => item.bet_id === "bet-unknown-resource-inputs");
    assert.ok(unknownBet);

    assert.equal(unknownBet.CASH_REQUIREMENT_RANGE.currency, "UNKNOWN");
    assert.equal(unknownBet.CASH_REQUIREMENT_RANGE.low_cents, null);
    assert.equal(unknownBet.CASH_REQUIREMENT_RANGE.high_cents, null);
    assert.equal(unknownBet.CREATIVE_HOURS_RANGE.low_hours, null);
    assert.equal(unknownBet.CREATIVE_HOURS_RANGE.high_hours, null);
    assert.equal(highOption.ATTENTION_CAPACITY_LOAD.load_score, null);
    assert.ok(highOption.unknown_resource_inputs.includes("Creative hours range"));

    const view = toExecutiveGoalsCapacityViewModelV1(highOption);
    const unknownViewBet = view.active_bets.find((item) => item.bet_id === "bet-unknown-resource-inputs");
    assert.ok(unknownViewBet);
    assert.equal(unknownViewBet.cash_requirement.low_cents, null);
    assert.equal(unknownViewBet.creative_hours.low_hours, null);
  });

  it("dashboard executive view-model is compact and deterministic", () => {
    const views = toExecutiveGoalsCapacityViewModelsV1(GOALS_PORTFOLIO_CAPACITY_FIXTURES_V1);
    assert.deepEqual(
      views.map((item) => item.snapshot_id),
      [
        "goals-capacity-healthy-portfolio",
        "goals-capacity-high-option-weak-economics",
        "goals-capacity-overload-conflict"
      ]
    );

    const healthy = views[0];
    assert.equal(healthy.view_version, "executive_goals_capacity_view_v1.0");
    assert.equal(healthy.portfolio_state, "HEALTHY");
    assert.match(healthy.headline, /active strategic bets/);
    assert.ok(healthy.what_to_ignore.includes("Low-ticket commission volume"));
    assert.equal(healthy.keegan_action_required, "NO");
  });
});

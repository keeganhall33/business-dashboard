import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FINANCIAL_RECOMMENDATION_FIXTURES_V1,
  FINANCIAL_SCENARIO_FIXTURES_V1,
  FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1,
  PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1,
  deriveDirectFinancialValue,
  getFinancialIntelligenceFixtureBundleV1
} from "@/lib/financial-intelligence/fixtures";

describe("financial intelligence snapshot v1 fixtures", () => {
  it("keeps UNKNOWN money ranges unknown instead of collapsing them to zero", () => {
    const snapshot = FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1.find(
      (item) => item.snapshot_id === "financial-health-missing-unknown-cost-coverage"
    );
    assert.ok(snapshot);
    assert.equal(snapshot.contribution_profit_range.currency, "UNKNOWN");
    assert.equal(snapshot.contribution_profit_range.low_cents, null);
    assert.equal(snapshot.contribution_profit_range.high_cents, null);
    assert.equal(snapshot.contribution_profit_range.coverage_state, "UNKNOWN");

    const project = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find(
      (item) => item.assessment_id === "project-economics-missing-unknown-cost-coverage"
    );
    assert.ok(project);
    assert.equal(project.contribution_range.low_cents, null);
    assert.equal(project.contribution_range.high_cents, null);
    assert.equal(project.CONTRIBUTION_VALUE_RANGE.low_cents, null);
    assert.equal(project.DIRECT_COST_RANGE.currency, "UNKNOWN");
    assert.equal(project.direct_financial_value, "UNKNOWN");
  });

  it("does not silently convert strategic value into dollars", () => {
    const project = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find(
      (item) => item.assessment_id === "project-economics-strategic-weak-direct"
    );
    assert.ok(project);
    assert.deepEqual(project.strategic_value_not_monetized, [
      "Institutional authority signal",
      "Premium positioning proof point"
    ]);
    assert.equal(project.direct_financial_value, "NEGATIVE");
    assert.equal(project.contribution_range.high_cents, -70000);
    assert.equal(project.STRATEGIC_OPTION_VALUE.not_monetized, true);
    assert.deepEqual(project.STRATEGIC_OPTION_VALUE.notes, project.strategic_value_not_monetized);
    assert.equal(project.DIRECT_REVENUE_RANGE.high_cents, 50000);
  });

  it("does not treat direct revenue as contribution profit", () => {
    const project = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find(
      (item) => item.assessment_id === "project-economics-high-revenue-high-capital-concentration"
    );
    assert.ok(project);
    assert.equal(project.direct_revenue_range.low_cents, 2800000);
    assert.equal(project.contribution_range.low_cents, 900000);
    assert.equal(project.DIRECT_REVENUE_RANGE.low_cents, 2800000);
    assert.equal(project.DIRECT_COST_RANGE.low_cents, 850000);
    assert.equal(project.CREATIVE_HOURS.low_hours, 180);
    assert.notEqual(project.direct_revenue_range.low_cents, project.contribution_range.low_cents);

    assert.equal(
      deriveDirectFinancialValue({
        directRevenueRange: project.direct_revenue_range,
        contributionRange: project.contribution_range
      }),
      "POSITIVE"
    );
  });

  it("visibly qualifies confidence when cost coverage is incomplete", () => {
    const snapshot = FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1.find(
      (item) => item.snapshot_id === "financial-health-missing-unknown-cost-coverage"
    );
    assert.ok(snapshot);
    assert.equal(snapshot.confidence.level, "LOW");
    assert.ok(snapshot.confidence.qualifiers.includes("contribution_cost_coverage_unknown"));

    const project = PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.find(
      (item) => item.assessment_id === "project-economics-missing-unknown-cost-coverage"
    );
    assert.ok(project);
    assert.equal(project.confidence.level, "LOW");
    assert.ok(project.confidence.qualifiers.includes("project_cost_coverage_unknown"));
  });

  it("supports deterministic base upside downside scenarios with explicit unknowns", () => {
    assert.deepEqual(
      FINANCIAL_SCENARIO_FIXTURES_V1.map((item) => item.scenario_id),
      [
        "scenario-base-controlled-originals",
        "scenario-upside-deposit-covered-commission",
        "scenario-downside-liquidity-pinch",
        "scenario-unknown-cost-print-drop"
      ]
    );
    assert.deepEqual(
      FINANCIAL_SCENARIO_FIXTURES_V1.map((item) => item.kind),
      ["BASE", "UPSIDE", "DOWNSIDE", "BASE"]
    );
    const downside = FINANCIAL_SCENARIO_FIXTURES_V1.find((item) => item.kind === "DOWNSIDE");
    assert.ok(downside);
    assert.equal(downside.liquidity_pinch_window.start, "2026-09-15");

    const unknown = FINANCIAL_SCENARIO_FIXTURES_V1.find((item) => item.scenario_id === "scenario-unknown-cost-print-drop");
    assert.ok(unknown);
    assert.equal(unknown.projected_contribution_range.currency, "UNKNOWN");
    assert.equal(unknown.projected_contribution_range.low_cents, null);
    assert.ok(unknown.unknowns.includes("profit"));
  });

  it("emits recommendations without fake dollars or autonomous action", () => {
    const strategic = FINANCIAL_RECOMMENDATION_FIXTURES_V1.find((item) => item.recommendation_id === "financial-rec-preserve-strategic-study");
    assert.ok(strategic);
    assert.equal(strategic.approval_required_before_action, true);
    assert.equal(strategic.strategic_option_value?.not_monetized, true);
    assert.equal(strategic.expected_financial_effect.high_cents, -70000);

    const unknown = FINANCIAL_RECOMMENDATION_FIXTURES_V1.find((item) => item.recommendation_id === "financial-rec-block-unknown-cost-profit");
    assert.ok(unknown);
    assert.equal(unknown.expected_financial_effect.currency, "UNKNOWN");
    assert.equal(unknown.expected_financial_effect.low_cents, null);
  });

  it("returns deterministic fixture ordering and output", () => {
    const first = JSON.stringify(getFinancialIntelligenceFixtureBundleV1());
    const second = JSON.stringify(getFinancialIntelligenceFixtureBundleV1());
    assert.equal(first, second);
    assert.deepEqual(
      FINANCIAL_HEALTH_SNAPSHOT_FIXTURES_V1.map((item) => item.snapshot_id),
      [
        "financial-health-healthy-cash-positive-contribution",
        "financial-health-missing-unknown-cost-coverage"
      ]
    );
    assert.deepEqual(
      PROJECT_ECONOMICS_ASSESSMENT_FIXTURES_V1.map((item) => item.assessment_id),
      [
        "project-economics-high-revenue-high-capital-concentration",
        "project-economics-missing-unknown-cost-coverage",
        "project-economics-strategic-weak-direct"
      ]
    );
    assert.equal(getFinancialIntelligenceFixtureBundleV1().scenarios.length, 4);
    assert.equal(getFinancialIntelligenceFixtureBundleV1().recommendations.length, 3);
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionPortfolioItemV1 } from "../../src/lib/strategy-engine/decision-portfolio-v1";
import type { DecisionScenarioComparisonV1 } from "../../src/lib/strategy-engine/decision-scenario-adapter-v1";
import {
  calibrateDecisionValueV1,
  DecisionValueCalibrationError,
  type DecisionSubstitutionV1,
  type DecisionValueReferenceClassV1,
  type FounderOpportunityCostV1
} from "../../src/lib/strategy-engine/decision-value-calibration-v1";

const generatedAt = "2026-09-16T04:00:00.000Z";

function portfolioItem(overrides: Partial<DecisionPortfolioItemV1["candidate"]> = {}): DecisionPortfolioItemV1 {
  return {
    candidate: {
      id: "opportunity-1", title: "Opportunity", candidateType: "OPPORTUNITY", owner: "KEEGAN", approvalClass: "KEEGAN",
      evidenceState: "KNOWN", evidenceRefs: ["portfolio:e1"], sourceRefs: ["crm:o1"], monetaryCase: null,
      value: { strategicFit: 80, compoundingAdvantage: 70, relationshipAccess: 90, futureOptions: 80, learningValue: 50, urgency: 60, reversibility: 50 },
      risk: { execution: 20, reputation: 20, rights: 10 }, resources: { keeganHours: 10, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
      dependencyIds: [], conflictKeys: [], blockers: [], informationGainAction: null, safeNextStep: "Prepare decision", successMetric: "Decision made",
      evaluationWindow: { start: "2026-09-01", end: "2026-10-01" }, ...overrides
    },
    disposition: "SELECTED", score: { monetaryExpectedCents: null, monetaryScore: 0, strategicScore: 0, riskPenalty: 0, totalScore: 0, components: {} },
    rank: 1, rationale: "Selected", exclusionReason: null, displacedBy: []
  };
}

function comparison(overrides: Partial<DecisionScenarioComparisonV1> = {}): DecisionScenarioComparisonV1 {
  const qualitative = [{ dimension: "PRESTIGE" as const, direction: "POSITIVE" as const, rationale: "Institutional signal", evidenceRefs: ["qual:e1"] }];
  return {
    contractVersion: "DecisionScenarioComparisonV1", policyVersion: "decision_scenario_policy_v1.0.0", comparisonId: "comparison-1",
    portfolioId: "portfolio-1", candidateId: "opportunity-1", generatedAt, decisionMode: "HUMAN_JUDGMENT_REQUIRED",
    alternatives: ["DO", "DO_NOT", "DELAY", "ALTERNATIVE"].map((kind, index) => ({
      scenarioId: `scenario-${index}`, kind: kind as "DO" | "DO_NOT" | "DELAY" | "ALTERNATIVE", label: kind,
      support: "SUPPORTED", evidenceState: "KNOWN", evidenceRefs: [`scenario:e${index}`], sourceRefs: [],
      monetaryRange: null, keeganHoursRange: null, measurableEffects: [], qualitativeEffects: index === 0 ? qualitative : [],
      firstOrderConsequences: [], secondOrderConsequences: [], assumptions: [], contradictions: [], sensitivityVariables: [],
      breakEvenConditions: [], strongestCaseAgainst: "Capacity may be better used elsewhere", weakestAssumption: "Partner follow-through",
      reversibility: "PARTIALLY_REVERSIBLE", whatWouldChangeTheAnswer: ["Partner withdraws"]
    })),
    uncertainty: { evidenceState: "KNOWN", unsupportedVariableIds: [], widestRangeScenarioIds: [], contradictionsPresent: false, qualitativeValueNotDollarized: true },
    challenge: { strongestCasesAgainst: [], irreversibleScenarioIds: [], whatWouldChangeTheAnswer: ["Partner withdraws"] },
    evidenceRefs: ["scenario:e1"], sourceRefs: [], actionAuthority: { simulationOnly: true, externalActionAuthorized: false, approvalClassPreserved: "KEEGAN" },
    ...overrides
  };
}

function reference(overrides: Partial<DecisionValueReferenceClassV1> = {}): DecisionValueReferenceClassV1 {
  return {
    referenceClassId: "ref-1", evidenceState: "KNOWN", observedAt: "2026-09-10T04:00:00Z", sampleSize: 20, staleAfterDays: 60,
    grossValueRangeCents: { downside: 1_000_000, base: 2_000_000, upside: 4_000_000 }, successProbability: { low: 0.25, base: 0.5, high: 0.75 },
    optionValueRangeCents: { downside: 0, base: 250_000, upside: 1_000_000 }, compoundingValueRangeCents: { downside: 0, base: 100_000, upside: 500_000 },
    evidenceRefs: ["reference:e1"], ...overrides
  };
}

function founder(overrides: Partial<FounderOpportunityCostV1> = {}): FounderOpportunityCostV1 {
  return {
    hourlyCostRangeCents: { downside: 10_000, base: 20_000, upside: 40_000 }, deepWorkInterruptionHours: 2,
    contextSwitchCount: 2, contextSwitchHours: 0.5, evidenceState: "KNOWN", evidenceRefs: ["founder:e1"], ...overrides
  };
}

function run(overrides: { item?: DecisionPortfolioItemV1; scenario?: DecisionScenarioComparisonV1; ref?: DecisionValueReferenceClassV1; founder?: FounderOpportunityCostV1; substitutions?: readonly DecisionSubstitutionV1[] } = {}) {
  return calibrateDecisionValueV1({
    portfolioId: "portfolio-1", portfolioItem: overrides.item ?? portfolioItem(), scenarioComparison: overrides.scenario ?? comparison(),
    referenceClass: overrides.ref ?? reference(), founderOpportunityCost: overrides.founder ?? founder(), substitutions: overrides.substitutions, generatedAt
  });
}

test("returns deterministic supported monetary ranges and keeps qualitative value separate", () => {
  const first = run();
  const second = run();
  assert.deepEqual(first, second);
  assert.equal(first.calibrationState, "SUPPORTED");
  assert.ok(first.monetary.expectedValueRangeCents);
  assert.equal(first.monetary.qualitativeValueDollarized, false);
  assert.equal(first.qualitativeValue[0].dimension, "PRESTIGE");
  assert.equal(first.actionAuthority.externalActionAuthorized, false);
  assert.equal(first.actionAuthority.approvalClassPreserved, "KEEGAN");
});

test("charges founder hours, deep-work interruption, and context switching before recommending work", () => {
  const result = run({
    ref: reference({ grossValueRangeCents: { downside: 10_000, base: 20_000, upside: 30_000 }, successProbability: { low: 0.5, base: 0.5, high: 0.5 }, optionValueRangeCents: null, compoundingValueRangeCents: null }),
    scenario: comparison({ alternatives: comparison().alternatives.map((item) => ({ ...item, qualitativeEffects: [] })) })
  });
  assert.equal(result.founderTime.displacedKeeganHours, 13);
  assert.equal(result.disposition, "DECLINE");
  assert.ok(result.monetary.netSupportedValueRangeCents!.upside < 0);
});

test("selects the strongest supported substitution while preserving Keegan approval", () => {
  const result = run({ substitutions: [
    { owner: "IOANA", eligible: true, keeganHoursSaved: 6, replacementHours: 7, evidenceState: "KNOWN", evidenceRefs: ["sub:ioana"] },
    { owner: "JEEVES", eligible: true, keeganHoursSaved: 9, replacementHours: 20, evidenceState: "KNOWN", evidenceRefs: ["sub:jeeves"] }
  ] });
  assert.equal(result.disposition, "SUBSTITUTE_JEEVES");
  assert.equal(result.founderTime.substitutionOwner, "JEEVES");
  assert.equal(result.founderTime.remainingKeeganHours, 1);
  assert.equal(result.actionAuthority.approvalClassPreserved, "KEEGAN");

  const ioana = run({ substitutions: [
    { owner: "IOANA", eligible: true, keeganHoursSaved: 6, replacementHours: 7, evidenceState: "KNOWN", evidenceRefs: ["sub:ioana"] }
  ] });
  assert.equal(ioana.disposition, "SUBSTITUTE_IOANA");
  assert.equal(ioana.founderTime.substitutionOwner, "IOANA");
});

test("widens thin calibration and waits on stale calibration", () => {
  const thin = run({ ref: reference({ evidenceState: "INFERRED", sampleSize: 2 }) });
  assert.equal(thin.calibrationState, "WIDENED");
  assert.ok(thin.uncertainty.reasons.includes("REFERENCE_CLASS_THIN"));
  assert.ok(thin.monetary.netSupportedValueRangeCents!.upside - thin.monetary.netSupportedValueRangeCents!.downside > 0);

  const stale = run({ ref: reference({ evidenceState: "STALE", observedAt: "2025-01-01T00:00:00Z" }) });
  assert.equal(stale.calibrationState, "WIDENED");
  assert.equal(stale.disposition, "WAIT");
  assert.ok(stale.uncertainty.reasons.includes("REFERENCE_CLASS_STALE"));
});

test("preserves UNKNOWN instead of coercing missing support to zero", () => {
  const result = run({ ref: reference({ evidenceState: "UNKNOWN", sampleSize: 0 }) });
  assert.equal(result.calibrationState, "UNKNOWN");
  assert.equal(result.disposition, "GATHER_EVIDENCE");
  assert.equal(result.monetary.expectedValueRangeCents, null);
  assert.equal(result.monetary.netSupportedValueRangeCents, null);
});

test("refuses monetary ranking when scenario evidence requires research", () => {
  const result = run({ scenario: comparison({ decisionMode: "RESEARCH_FIRST" }) });
  assert.equal(result.calibrationState, "REFUSED");
  assert.equal(result.disposition, "GATHER_EVIDENCE");
  assert.ok(result.uncertainty.reasons.includes("SCENARIO_RESEARCH_REQUIRED"));
});

test("applies opportunity-window decay without turning qualitative value into money", () => {
  const result = run({ item: portfolioItem({ evaluationWindow: { start: "2026-08-01", end: "2026-09-15" } }) });
  assert.equal(result.monetary.windowDecayFactor, 0);
  assert.equal(result.disposition, "WAIT");
  assert.equal(result.qualitativeValue[0].rationale, "Institutional signal");
});

test("does not infer a permanent preference from one outcome and remains immutable", () => {
  const item = portfolioItem();
  const ref = reference();
  const before = structuredClone({ item, ref });
  const result = run({ item, ref });
  assert.deepEqual({ item, ref }, before);
  assert.equal(result.uncertainty.permanentPreferenceInferred, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.qualitativeValue));
});

test("rejects identity drift, unordered ranges, and duplicate substitute owners", () => {
  assert.throws(() => run({ scenario: comparison({ candidateId: "other" }) }), (error: unknown) => error instanceof DecisionValueCalibrationError && error.code === "IDENTITY_MISMATCH");
  assert.throws(() => run({ ref: reference({ grossValueRangeCents: { downside: 100, base: 50, upside: 0 } }) }), /must be ordered/);
  const duplicate = { owner: "IOANA" as const, eligible: true, keeganHoursSaved: 1, replacementHours: 1, evidenceState: "KNOWN" as const, evidenceRefs: [] };
  assert.throws(() => run({ substitutions: [duplicate, duplicate] }), (error: unknown) => error instanceof DecisionValueCalibrationError && error.code === "DUPLICATE_SUBSTITUTION");
});

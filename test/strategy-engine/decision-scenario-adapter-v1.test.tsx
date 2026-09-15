import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionPortfolioItemV1 } from "../../src/lib/strategy-engine/decision-portfolio-v1";
import { buildDecisionScenarioComparisonV1, DecisionScenarioError, type DecisionScenarioAlternativeInputV1, type DecisionScenarioKindV1 } from "../../src/lib/strategy-engine/decision-scenario-adapter-v1";

const item = {
  candidate: { id: "opportunity-1", approvalClass: "KEEGAN", evidenceState: "KNOWN", evidenceRefs: ["portfolio:e1"], sourceRefs: ["crm:o1"] },
  disposition: "SELECTED", score: {}, rank: 1, rationale: "selected", exclusionReason: null, displacedBy: []
} as unknown as DecisionPortfolioItemV1;

function alternative(kind: DecisionScenarioKindV1, overrides: Partial<DecisionScenarioAlternativeInputV1> = {}): DecisionScenarioAlternativeInputV1 {
  return {
    scenarioId: `scenario-${kind.toLowerCase()}`,
    kind,
    label: kind,
    support: "SUPPORTED",
    evidenceState: "KNOWN",
    evidenceRefs: [`evidence:${kind}`],
    sourceRefs: [`source:${kind}`],
    monetaryRange: { unit: "USD_CENTS", downside: -10_000, base: 50_000, upside: 100_000 },
    keeganHoursRange: { unit: "HOURS", downside: 2, base: 4, upside: 8 },
    measurableEffects: [{ metric: "qualified_demand", range: { unit: "PERCENT", downside: -5, base: 10, upside: 20 }, evidenceRefs: [`metric:${kind}`] }],
    qualitativeEffects: [{ dimension: "PRESTIGE", direction: "POSITIVE", rationale: "Strengthens institutional positioning", evidenceRefs: [`prestige:${kind}`] }],
    firstOrderConsequences: ["Consumes declared capacity"],
    secondOrderConsequences: ["May create a future access path"],
    assumptions: ["The partner remains interested"],
    contradictions: [],
    sensitivityVariables: [{ variable: "partner_probability", lowCase: "The project pauses", highCase: "The project advances", evidenceRefs: [`sensitivity:${kind}`] }],
    breakEvenConditions: [{ condition: "Supported revenue covers direct cash cost", evidenceState: "KNOWN", evidenceRefs: [`break-even:${kind}`] }],
    strongestCaseAgainst: "The same capacity may produce more value elsewhere",
    weakestAssumption: "Partner follow-through",
    reversibility: "PARTIALLY_REVERSIBLE",
    whatWouldChangeTheAnswer: ["Verified loss of partner interest"],
    ...overrides
  };
}

const alternatives = () => (["DO", "DO_NOT", "DELAY", "ALTERNATIVE"] as const).map((kind) => alternative(kind));

test("builds a deterministic complete counterfactual set with preserved approval and no action authority", () => {
  const input = { portfolioId: "portfolio-1", portfolioItem: item, alternatives: alternatives(), generatedAt: "2026-09-15T04:00:00Z" };
  const first = buildDecisionScenarioComparisonV1(input);
  const second = buildDecisionScenarioComparisonV1(structuredClone(input));
  assert.deepEqual(first, second);
  assert.deepEqual(first.alternatives.map((value) => value.kind), ["DO", "DO_NOT", "DELAY", "ALTERNATIVE"]);
  assert.equal(first.decisionMode, "HUMAN_JUDGMENT_REQUIRED");
  assert.equal(first.actionAuthority.externalActionAuthorized, false);
  assert.equal(first.actionAuthority.approvalClassPreserved, "KEEGAN");
  assert.ok(Object.isFrozen(first));
});

test("routes weak evidence and blocked variables to research first", () => {
  const values = alternatives();
  values[2] = alternative("DELAY", { support: "BLOCKED", evidenceState: "UNKNOWN", evidenceRefs: [] });
  const result = buildDecisionScenarioComparisonV1({ portfolioId: "portfolio-1", portfolioItem: item, alternatives: values, generatedAt: "2026-09-15" });
  assert.equal(result.decisionMode, "RESEARCH_FIRST");
  assert.deepEqual(result.uncertainty.unsupportedVariableIds, ["scenario-delay"]);
});

test("widens inferred numeric ranges and refuses fake precision", () => {
  const values = alternatives();
  values[0] = alternative("DO", { evidenceState: "INFERRED", support: "HYPOTHESIS", monetaryRange: { unit: "USD_CENTS", downside: 10, base: 10, upside: 10 } });
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: values, generatedAt: "2026-09-15" }), (error: unknown) => error instanceof DecisionScenarioError && error.code === "FAKE_PRECISION");
});

test("keeps qualitative effects separate and refuses dollarized prestige", () => {
  const values = alternatives();
  values[0] = alternative("DO", { qualitativeEffects: [{ dimension: "PRESTIGE", direction: "POSITIVE", rationale: "Worth $50,000 in prestige", evidenceRefs: [] }] });
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: values, generatedAt: "2026-09-15" }), (error: unknown) => error instanceof DecisionScenarioError && error.code === "QUALITATIVE_VALUE_DOLLARIZED");
});

test("surfaces contradictions, strongest cases against, weakest assumptions, and change conditions", () => {
  const values = alternatives();
  values[0] = alternative("DO", { contradictions: ["A rights holder has not approved reproduction"], reversibility: "IRREVERSIBLE", whatWouldChangeTheAnswer: ["Rights approval is denied", "Verified loss of partner interest"] });
  const result = buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: values, generatedAt: "2026-09-15" });
  assert.equal(result.uncertainty.contradictionsPresent, true);
  assert.deepEqual(result.challenge.irreversibleScenarioIds, ["scenario-do"]);
  assert.equal(result.challenge.strongestCasesAgainst.length, 4);
  assert.deepEqual(result.challenge.whatWouldChangeTheAnswer, ["Rights approval is denied", "Verified loss of partner interest"]);
});

test("identifies the widest supported scenario range without ranking strategic choices", () => {
  const values = alternatives();
  values[3] = alternative("ALTERNATIVE", { monetaryRange: { unit: "USD_CENTS", downside: -1_000_000, base: 0, upside: 2_000_000 } });
  const result = buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: values, generatedAt: "2026-09-15" });
  assert.deepEqual(result.uncertainty.widestRangeScenarioIds, ["scenario-alternative"]);
  assert.equal("recommendedScenarioId" in result, false);
});

test("rejects incomplete, duplicate, malformed, or falsely supported scenarios", () => {
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: alternatives().slice(0, 3), generatedAt: "2026-09-15" }), /Exactly DO/);
  const duplicateKinds = alternatives(); duplicateKinds[3] = alternative("DO", { scenarioId: "second-do" });
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: duplicateKinds, generatedAt: "2026-09-15" }), /Each counterfactual kind/);
  const badRange = alternatives(); badRange[0] = alternative("DO", { monetaryRange: { unit: "USD_CENTS", downside: 100, base: 50, upside: 0 } });
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: badRange, generatedAt: "2026-09-15" }), /ordered downside/);
  const falseSupport = alternatives(); falseSupport[0] = alternative("DO", { evidenceState: "STALE" });
  assert.throws(() => buildDecisionScenarioComparisonV1({ portfolioId: "p", portfolioItem: item, alternatives: falseSupport, generatedAt: "2026-09-15" }), (error: unknown) => error instanceof DecisionScenarioError && error.code === "UNSUPPORTED_CERTAINTY");
});

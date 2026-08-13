import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionDecompositionV1, buildValueOfInformationPlanV1 } from "../../../src/lib/intelligence/performance-v2/phase-b/decompose-and-plan";

test("decomposition is deterministic and preserves UNKNOWN explicit", () => {
  const decomp = buildDecisionDecompositionV1(
    {
      decisionId: "dec-1",
      decisionSummary: "Decide whether to run a limited edition drop",
      timeHorizon: "30d",
      actionabilityThreshold: "high",
      knowns: [{ id: "k1", question: "Current inventory count is known" }],
      unknowns: [{ id: "u2", question: "Projected demand for the drop" }, { id: "u1", question: "Email list conversion rate for similar drops" }],
      hypotheses: [{ id: "h1", hypothesis: "Demand will be high due to recent press", disconfirmingEvidenceNeeded: ["recent demand data"] }]
    },
    "2026-08-13T00:00:00.000Z"
  );

  assert.equal(decomp.v, "DecisionDecompositionV1");
  assert.equal(decomp.timeHorizon, "30d");
  assert.equal(decomp.actionabilityThreshold, "high");
  assert.equal(decomp.knowns[0].truth, "KNOWN");
  assert.equal(decomp.unknowns.length, 2);
  assert.ok(decomp.unknowns.every((u) => u.truth === "UNKNOWN"));
});

test("VOI plan chooses exactly one nextMissingFact deterministically when unknowns exist", () => {
  const decomp = buildDecisionDecompositionV1(
    {
      decisionId: "dec-2",
      decisionSummary: "Decide whether to increase ad spend",
      unknowns: [{ id: "uB", question: "Incremental ROAS at higher spend" }, { id: "uA", question: "Current CAC by channel" }]
    },
    "2026-08-13T00:00:00.000Z"
  );
  const plan = buildValueOfInformationPlanV1(decomp, { nowIso: "2026-08-13T00:00:00.000Z" });
  assert.equal(plan.v, "ValueOfInformationPlanV1");
  assert.equal(plan.stop.shouldStop, false);
  assert.ok(plan.nextMissingFact);
  // Deterministic: id sort => uA first.
  assert.equal(plan.nextMissingFact.id, "uA");
});

test("VOI plan stops when no unknowns", () => {
  const decomp = buildDecisionDecompositionV1(
    {
      decisionId: "dec-3",
      decisionSummary: "No research needed",
      knowns: [{ id: "k1", question: "Everything known" }],
      unknowns: []
    },
    "2026-08-13T00:00:00.000Z"
  );
  const plan = buildValueOfInformationPlanV1(decomp, { nowIso: "2026-08-13T00:00:00.000Z" });
  assert.equal(plan.stop.shouldStop, true);
  assert.equal(plan.stop.reason, "no_unknowns");
  assert.equal(plan.nextMissingFact, null);
});

test("VOI plan can stop when marginal value is low", () => {
  const decomp = buildDecisionDecompositionV1(
    {
      decisionId: "dec-4",
      decisionSummary: "Small decision",
      unknowns: [{ id: "u1", question: "One missing fact" }]
    },
    "2026-08-13T00:00:00.000Z"
  );
  const plan = buildValueOfInformationPlanV1(decomp, { nowIso: "2026-08-13T00:00:00.000Z", marginalValueLow: true });
  assert.equal(plan.stop.shouldStop, true);
  assert.equal(plan.stop.reason, "marginal_value_low");
  assert.equal(plan.nextMissingFact, null);
});


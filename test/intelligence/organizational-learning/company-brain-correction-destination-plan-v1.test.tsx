import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CORRECTION_DESTINATION_AFFECTED_REFS_V1,
  MAX_CORRECTION_DESTINATION_EVIDENCE_REFS_V1,
  companyBrainCorrectionClassesV1,
  planCompanyBrainCorrectionDestinationV1,
  type CompanyBrainCorrectionDestinationInputV1
} from "@/lib/intelligence/organizational-learning/company-brain-correction-destination-plan-v1";

function correction(
  overrides: Partial<CompanyBrainCorrectionDestinationInputV1> = {}
): CompanyBrainCorrectionDestinationInputV1 {
  return {
    correctionId: "correction:1",
    correctionClass: "MISSING_OR_WRONG_FACT",
    truthState: "KNOWN",
    sourceInteractionRef: "interaction:chat:1",
    sourceRunRef: "run:1",
    actorRef: "actor:keegan",
    observedAt: "2026-09-19T10:00:00.000Z",
    generatedAt: "2026-09-19T11:00:00.000Z",
    originalState: "Old recorded state",
    proposedState: "Corrected proposed state",
    evidenceRefs: ["evidence:1"],
    affectedCanonicalRefs: ["canonical:relationship:1"],
    ...overrides
  };
}

const expectedRoutes = {
  MISSING_OR_WRONG_FACT: [
    "CANONICAL_EVIDENCE_CORRECTION_REVIEW",
    "PREPARE_EVIDENCE_CORRECTION_REVIEW"
  ],
  STRATEGIC_CHOICE_OR_WHY: [
    "DECISION_MEMORY_REVIEW",
    "PREPARE_DECISION_MEMORY_REVIEW"
  ],
  REPEATED_PREFERENCE_OR_STANDARD: [
    "PREFERENCE_POLICY_REVIEW",
    "PREPARE_PREFERENCE_POLICY_REVIEW"
  ],
  PROVEN_TECHNIQUE: [
    "SKILL_PLAYBOOK_REVIEW",
    "PREPARE_SKILL_PLAYBOOK_REVIEW"
  ],
  REPEATABLE_SEQUENCE: [
    "AUTOMATION_CANDIDATE_REVIEW",
    "PREPARE_AUTOMATION_CANDIDATE_REVIEW"
  ],
  DANGEROUS_ACTION_OR_NEVER_DO: [
    "SAFETY_POLICY_AND_APPROVAL_GATE_REVIEW",
    "PREPARE_SAFETY_POLICY_REVIEW"
  ],
  PROMPT_AGENT_WORKFLOW_FAILURE: [
    "EVAL_REGRESSION_REVIEW",
    "PREPARE_EVAL_REGRESSION_REVIEW"
  ],
  VALIDATED_LESSON: [
    "LEARNING_REVIEW",
    "PREPARE_LEARNING_REVIEW"
  ]
} as const;

test("routes every explicitly preclassified correction to its review destination", () => {
  for (const correctionClass of companyBrainCorrectionClassesV1) {
    const output = planCompanyBrainCorrectionDestinationV1(correction({ correctionClass }));
    const [destination, safeNextStep] = expectedRoutes[correctionClass];
    assert.equal(output.status, "ROUTE_FOR_REVIEW");
    assert.equal(output.reasonCode, "SUPPORTED_PRECLASSIFIED_CORRECTION");
    assert.equal(output.correctionClass, correctionClass);
    assert.equal(output.destination, destination);
    assert.equal(output.safeNextStep, safeNextStep);
    assert.equal(output.canonicalPromotionRequiresGovernedReview, true);
    assert.equal(output.consequentialEffectRequiresExistingApprovalPolicy, true);
  }
});

test("does not infer a correction class from narrative text", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionClass: "THIS LOOKS LIKE A REPEATABLE WORKFLOW",
    proposedState: "Run this process every time."
  }));

  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "UNSUPPORTED_CORRECTION_CLASS");
  assert.equal(output.correctionClass, null);
  assert.equal(output.destination, null);
  assert.equal(output.safeNextStep, null);
});

test("withholds unknown, stale, and conflicted corrections rather than learning them", () => {
  const cases = [
    ["UNKNOWN", "UNKNOWN_CORRECTION"],
    ["STALE", "STALE_CORRECTION"],
    ["CONFLICTED", "CONFLICTED_CORRECTION"]
  ] as const;

  for (const [truthState, reasonCode] of cases) {
    const output = planCompanyBrainCorrectionDestinationV1(correction({ truthState }));
    assert.equal(output.status, "WITHHELD");
    assert.equal(output.reasonCode, reasonCode);
    assert.equal(output.destination, null);
  }
});

test("allows inferred evidence only as a governed review route, never canonical truth", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionClass: "PROVEN_TECHNIQUE",
    truthState: "INFERRED"
  }));

  assert.equal(output.status, "ROUTE_FOR_REVIEW");
  assert.equal(output.truthState, "INFERRED");
  assert.equal(output.canonicalPromotionRequiresGovernedReview, true);
  assert.equal(output.authority.canonicalTruthMutationAuthorized, false);
  assert.equal(output.authority.skillPromotionAuthorized, false);
});

test("withholds evidence-free and scope-free corrections", () => {
  let output = planCompanyBrainCorrectionDestinationV1(correction({ evidenceRefs: [] }));
  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "MISSING_EVIDENCE");

  output = planCompanyBrainCorrectionDestinationV1(correction({ affectedCanonicalRefs: [] }));
  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "MISSING_AFFECTED_SCOPE");
});

test("withholds future-dated evidence", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    observedAt: "2026-09-19T12:00:00.000Z",
    generatedAt: "2026-09-19T11:00:00.000Z"
  }));

  assert.equal(output.status, "WITHHELD");
  assert.equal(output.reasonCode, "FUTURE_CORRECTION");
  assert.equal(output.destination, null);
});

test("preserves source, actor, before/after state, evidence, and affected scope", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionId: " correction:preserve ",
    sourceInteractionRef: " interaction:email:9 ",
    sourceRunRef: " run:ingest:9 ",
    actorRef: " actor:keegan ",
    originalState: " old ",
    proposedState: " new ",
    evidenceRefs: ["evidence:b", "evidence:a"],
    affectedCanonicalRefs: ["canonical:b", "canonical:a"]
  }));

  assert.equal(output.status, "ROUTE_FOR_REVIEW");
  assert.equal(output.correctionId, "correction:preserve");
  assert.equal(output.sourceInteractionRef, "interaction:email:9");
  assert.equal(output.sourceRunRef, "run:ingest:9");
  assert.equal(output.actorRef, "actor:keegan");
  assert.equal(output.originalState, "old");
  assert.equal(output.proposedState, "new");
  assert.deepEqual(output.evidenceRefs, ["evidence:a", "evidence:b"]);
  assert.deepEqual(output.affectedCanonicalRefs, ["canonical:a", "canonical:b"]);
});

test("a dangerous-action correction can only prepare safety review", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionClass: "DANGEROUS_ACTION_OR_NEVER_DO",
    proposedState: "Never execute the recorded dangerous action without the existing approval gate."
  }));

  assert.equal(output.status, "ROUTE_FOR_REVIEW");
  assert.equal(output.destination, "SAFETY_POLICY_AND_APPROVAL_GATE_REVIEW");
  assert.equal(output.safeNextStep, "PREPARE_SAFETY_POLICY_REVIEW");
  assert.equal(output.authority.policyMutationAuthorized, false);
  assert.equal(output.authority.approvalGateMutationAuthorized, false);
  assert.equal(output.authority.externalActionAuthorized, false);
  assert.equal(output.authority.approvalBypassAuthorized, false);
});

test("a repeatable sequence remains an automation candidate, not an automation", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionClass: "REPEATABLE_SEQUENCE"
  }));

  assert.equal(output.destination, "AUTOMATION_CANDIDATE_REVIEW");
  assert.equal(output.authority.automationCreationAuthorized, false);
  assert.equal(output.authority.persistenceAuthorized, false);
});

test("a workflow failure routes to eval regression review without mutating evals", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction({
    correctionClass: "PROMPT_AGENT_WORKFLOW_FAILURE"
  }));

  assert.equal(output.destination, "EVAL_REGRESSION_REVIEW");
  assert.equal(output.authority.evalMutationAuthorized, false);
});

test("never emits confidence, causality, monetary value, or an inferred outcome", () => {
  const output = planCompanyBrainCorrectionDestinationV1(correction());
  const record = output as unknown as Record<string, unknown>;

  assert.equal("confidence" in record, false);
  assert.equal("causalInterpretation" in record, false);
  assert.equal("monetaryValue" in record, false);
  assert.equal("inferredOutcome" in record, false);
});

test("rejects duplicate, malformed, and over-bounded refs", () => {
  let output = planCompanyBrainCorrectionDestinationV1(correction({
    evidenceRefs: ["evidence:1", "evidence:1"]
  }));
  assert.equal(output.reasonCode, "INVALID_INPUT");

  output = planCompanyBrainCorrectionDestinationV1(correction({
    affectedCanonicalRefs: ["canonical:1", "canonical:1"]
  }));
  assert.equal(output.reasonCode, "INVALID_INPUT");

  output = planCompanyBrainCorrectionDestinationV1(correction({
    evidenceRefs: Array.from(
      { length: MAX_CORRECTION_DESTINATION_EVIDENCE_REFS_V1 + 1 },
      (_, index) => `evidence:${index}`
    )
  }));
  assert.equal(output.reasonCode, "INVALID_INPUT");

  output = planCompanyBrainCorrectionDestinationV1(correction({
    affectedCanonicalRefs: Array.from(
      { length: MAX_CORRECTION_DESTINATION_AFFECTED_REFS_V1 + 1 },
      (_, index) => `canonical:${index}`
    )
  }));
  assert.equal(output.reasonCode, "INVALID_INPUT");
});

test("rejects missing identity, actor, state text, and malformed timestamps", () => {
  for (const overrides of [
    { correctionId: " " },
    { sourceInteractionRef: " " },
    { actorRef: " " },
    { proposedState: " " },
    { originalState: " " },
    { sourceRunRef: " " },
    { observedAt: "not-a-date" },
    { generatedAt: "not-a-date" }
  ] as const) {
    const output = planCompanyBrainCorrectionDestinationV1(correction(overrides));
    assert.equal(output.status, "WITHHELD");
    assert.equal(output.reasonCode, "INVALID_INPUT");
  }
});

test("is deterministic, immutable, and authorizes no write or external action", () => {
  const input = correction({
    evidenceRefs: ["evidence:2", "evidence:1"],
    affectedCanonicalRefs: ["canonical:2", "canonical:1"]
  });
  const snapshot = structuredClone(input);
  const first = planCompanyBrainCorrectionDestinationV1(input);
  const second = planCompanyBrainCorrectionDestinationV1({
    ...input,
    evidenceRefs: [...input.evidenceRefs].reverse(),
    affectedCanonicalRefs: [...input.affectedCanonicalRefs].reverse()
  });

  assert.deepEqual(first, second);
  assert.deepEqual(input, snapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.evidenceRefs));
  assert.ok(Object.isFrozen(first.affectedCanonicalRefs));
  assert.ok(Object.isFrozen(first.authority));
  assert.equal(first.authority.persistenceAuthorized, false);
  assert.equal(first.authority.canonicalTruthMutationAuthorized, false);
  assert.equal(first.authority.decisionMutationAuthorized, false);
  assert.equal(first.authority.preferenceMutationAuthorized, false);
  assert.equal(first.authority.policyMutationAuthorized, false);
  assert.equal(first.authority.skillPromotionAuthorized, false);
  assert.equal(first.authority.automationCreationAuthorized, false);
  assert.equal(first.authority.evalMutationAuthorized, false);
  assert.equal(first.authority.approvalGateMutationAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.equal(first.authority.approvalBypassAuthorized, false);
});

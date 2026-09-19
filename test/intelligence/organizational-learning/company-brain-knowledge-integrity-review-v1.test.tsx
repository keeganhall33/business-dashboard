import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_RECORDS_V1,
  reviewCompanyBrainKnowledgeIntegrityV1
} from "@/lib/intelligence/organizational-learning/company-brain-knowledge-integrity-review-v1";
import {
  attachDecisionOutcomeObservationV1,
  compileDecisionMemoryV1,
  type DecisionMemoryInputV1,
  type DecisionMemoryRecordV1
} from "@/lib/intelligence/organizational-learning/decision-memory-v1";
import {
  approveLearningCandidateV1,
  createValidatedLessonCandidateV1,
  promoteLearningToCanonicalV1,
  supersedeLearningV1,
  validateLearningObjectV1,
  type LearningObjectV1
} from "@/lib/intelligence/organizational-learning/learning-object-v1";

const generatedAt = "2026-09-19T12:00:00.000Z";

function decisionInput(
  decisionId: string,
  overrides: Partial<DecisionMemoryInputV1> = {}
): DecisionMemoryInputV1 {
  return {
    decisionId,
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-10T12:00:00.000Z",
    actorRef: "actor:keegan",
    context: {
      state: "KNOWN",
      value: `Context for ${decisionId}`,
      evidenceRefs: [`evidence:${decisionId}:context`]
    },
    selectedAlternativeId: "alt:selected",
    alternatives: [{
      alternativeId: "alt:selected",
      label: "Selected",
      description: {
        state: "KNOWN",
        value: "Proceed with the bounded option.",
        evidenceRefs: [`evidence:${decisionId}:alternative`]
      }
    }],
    rationale: {
      state: "KNOWN",
      value: "The recorded rationale is evidence-backed.",
      evidenceRefs: [`evidence:${decisionId}:rationale`]
    },
    assumptions: [],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: [`evidence:${decisionId}:confidence`]
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: "2026-10-10T12:00:00.000Z",
    approval: {
      authorityClass: "ANALYSIS_ONLY",
      approvalState: "NOT_REQUIRED",
      approvedByRef: null,
      approvedAt: null,
      evidenceRefs: []
    },
    actionState: "PLANNED",
    actionEvidenceRefs: [],
    supersedesDecisionId: null,
    sourceRefs: [`source:${decisionId}`],
    ...overrides
  };
}

function decision(
  decisionId: string,
  overrides: Partial<DecisionMemoryInputV1> = {}
): DecisionMemoryRecordV1 {
  return compileDecisionMemoryV1(decisionInput(decisionId, overrides));
}

function decisionWithOutcome(decisionId: string): readonly DecisionMemoryRecordV1[] {
  const initial = decision(decisionId);
  const observed = attachDecisionOutcomeObservationV1(initial, {
    observedAt: "2026-09-15T12:00:00.000Z",
    outcomes: [],
    assessment: {
      state: "KNOWN",
      value: "POSITIVE",
      evidenceRefs: [`evidence:${decisionId}:assessment`]
    },
    attributionClass: "UNKNOWN",
    attributionEvidenceRefs: [],
    confounders: [],
    assumptionAssessments: [],
    lessonCandidate: null,
    sourceRefs: [`source:${decisionId}:outcome`]
  });
  return [initial, observed];
}

function canonicalLearning(
  learningId: string,
  observedAt = "2026-09-09T12:00:00.000Z"
): Readonly<LearningObjectV1> {
  const candidate = createValidatedLessonCandidateV1({
    learning_id: learningId,
    truth_state: "KNOWN",
    scope: "COMPANY",
    title: `Lesson ${learningId}`,
    content: "This lesson remains a reviewed historical observation, not a causal rule.",
    confidence: 0.5,
    observed_at: observedAt,
    evidence: [{
      evidence_id: `evidence:${learningId}`,
      source_lineage_id: `source:${learningId}`,
      observed_at: observedAt
    }]
  });
  const approved = approveLearningCandidateV1(candidate, {
    reviewer_id: "reviewer:keegan",
    reviewed_at: "2026-09-10T12:00:00.000Z",
    decision: "APPROVE"
  });
  return promoteLearningToCanonicalV1(approved, "2026-09-11T12:00:00.000Z");
}

function review(
  decisionRecords: readonly DecisionMemoryRecordV1[] = [],
  learningObjects: readonly LearningObjectV1[] = []
) {
  return reviewCompanyBrainKnowledgeIntegrityV1({
    generatedAt,
    decisionRecords,
    learningObjects
  });
}

function issueCodes(result: ReturnType<typeof review>): readonly string[] {
  return result.issues.map((issue) => issue.code);
}

test("returns only exact current decision and learning truth without inventing business claims", () => {
  const result = review([decision("decision:current")], [canonicalLearning("learning:current")]);

  assert.equal(result.state, "READY");
  assert.deepEqual(result.currentDecisions.map((item) => item.decisionId), ["decision:current"]);
  assert.deepEqual(result.currentLearning.map((item) => item.learningId), ["learning:current"]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.analysisOnly, true);
  assert.equal(result.authority.persistenceAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("accepts one exact decision revision chain and exposes only its tip", () => {
  const [initial, observed] = decisionWithOutcome("decision:revised");
  const result = review([initial, observed]);

  assert.equal(result.state, "READY");
  assert.equal(result.currentDecisions.length, 1);
  assert.equal(result.currentDecisions[0].recordId, observed.recordId);
  assert.notEqual(initial.recordId, observed.recordId);
});

test("fails closed on duplicate decision ids, missing predecessors, and revision forks", () => {
  const one = decision("decision:duplicate-record");
  const duplicateRecord = { ...decision("decision:other"), recordId: one.recordId } as DecisionMemoryRecordV1;
  let result = review([one, duplicateRecord]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DUPLICATE_DECISION_RECORD_ID"));

  const missingPrior = {
    ...decision("decision:missing-prior"),
    priorRecordId: "record:missing"
  } as DecisionMemoryRecordV1;
  result = review([missingPrior]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_REVISION_PREDECESSOR_MISSING"));

  const root = decision("decision:fork");
  const firstChild = {
    ...root,
    recordId: "record:fork:one",
    priorRecordId: root.recordId
  } as DecisionMemoryRecordV1;
  const secondChild = {
    ...root,
    recordId: "record:fork:two",
    priorRecordId: root.recordId
  } as DecisionMemoryRecordV1;
  result = review([root, firstChild, secondChild]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_REVISION_FORK"));
  assert.deepEqual(result.currentDecisions, []);
});

test("routes expired or integrity-flagged active decisions to review instead of silently reusing them", () => {
  const expired = decision("decision:expired", {
    validUntil: "2026-09-18T12:00:00.000Z"
  });
  const unsupported = decision("decision:unsupported", {
    rationale: { state: "UNKNOWN", value: null, evidenceRefs: [] }
  });
  const result = review([expired, unsupported]);

  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.deepEqual(result.currentDecisions, []);
  assert.deepEqual(result.reviewDecisionIds, ["decision:expired", "decision:unsupported"]);
  assert.ok(issueCodes(result).includes("ACTIVE_DECISION_EXPIRED"));
  assert.ok(issueCodes(result).includes("DECISION_INTEGRITY_FLAGS_PRESENT"));
});

test("rejects outcome or attribution claims that lack their own evidence", () => {
  const [, observed] = decisionWithOutcome("decision:outcome-integrity");
  const withoutOutcomeEvidence = {
    ...observed,
    outcomeObservation: {
      ...observed.outcomeObservation!,
      sourceRefs: []
    }
  } as DecisionMemoryRecordV1;
  let result = review([decision("decision:outcome-integrity"), withoutOutcomeEvidence]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_OUTCOME_EVIDENCE_MISSING"));

  const withUnsupportedAttribution = {
    ...observed,
    outcomeObservation: {
      ...observed.outcomeObservation!,
      attributionClass: "CORRELATIONAL" as const,
      attributionEvidenceRefs: []
    }
  } as DecisionMemoryRecordV1;
  result = review([decision("decision:outcome-integrity"), withUnsupportedAttribution]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_ATTRIBUTION_EVIDENCE_MISSING"));
});

test("preserves explicit decision supersession without resurrecting the predecessor", () => {
  const predecessor = decision("decision:old", {
    decidedAt: "2026-09-01T12:00:00.000Z"
  });
  const successor = decision("decision:new", {
    decidedAt: "2026-09-12T12:00:00.000Z",
    supersedesDecisionId: "decision:old"
  });
  const result = review([predecessor, successor]);

  assert.equal(result.state, "READY");
  assert.deepEqual(result.currentDecisions.map((item) => item.decisionId), ["decision:new"]);
});

test("fails closed on decision supersession forks and cycles", () => {
  const predecessor = decision("decision:predecessor", {
    decidedAt: "2026-09-01T12:00:00.000Z"
  });
  const a = decision("decision:successor-a", {
    decidedAt: "2026-09-02T12:00:00.000Z",
    supersedesDecisionId: "decision:predecessor"
  });
  const b = decision("decision:successor-b", {
    decidedAt: "2026-09-03T12:00:00.000Z",
    supersedesDecisionId: "decision:predecessor"
  });
  let result = review([predecessor, a, b]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_SUPERSESSION_FORK"));

  const cycleA = decision("decision:cycle-a", {
    decidedAt: "2026-09-04T12:00:00.000Z",
    supersedesDecisionId: "decision:cycle-b"
  });
  const cycleB = decision("decision:cycle-b", {
    decidedAt: "2026-09-04T12:00:00.000Z",
    supersedesDecisionId: "decision:cycle-a"
  });
  result = review([cycleA, cycleB]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_SUPERSESSION_CYCLE"));
  assert.deepEqual(result.currentDecisions, []);
});

test("routes stale canonical learning to review and unsafe current truth to verification", () => {
  const canonical = canonicalLearning("learning:stale");
  const stale = validateLearningObjectV1({ ...canonical, truth_state: "STALE" });
  let result = review([], [stale]);
  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.deepEqual(result.reviewLearningIds, ["learning:stale"]);
  assert.deepEqual(result.currentLearning, []);
  assert.ok(issueCodes(result).includes("ACTIVE_LEARNING_STALE"));

  const conflicted = validateLearningObjectV1({
    ...canonicalLearning("learning:conflicted"),
    truth_state: "CONFLICTED"
  });
  result = review([], [conflicted]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("ACTIVE_LEARNING_UNSAFE_TRUTH"));
});

test("requires explicit authoritative successors for superseded learning and detects cycles", () => {
  const oldCanonical = canonicalLearning("learning:old");
  const missingSuccessor = supersedeLearningV1(
    oldCanonical,
    "learning:missing",
    "Replaced by a reviewed successor.",
    "2026-09-12T12:00:00.000Z"
  );
  let result = review([], [missingSuccessor]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("LEARNING_SUPERSESSION_SUCCESSOR_NOT_AUTHORITATIVE"));

  const newCanonical = canonicalLearning("learning:new");
  result = review([], [missingSuccessor, newCanonical]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("LEARNING_SUPERSESSION_SUCCESSOR_NOT_AUTHORITATIVE"));

  const linkedOld = supersedeLearningV1(
    oldCanonical,
    "learning:new",
    "Replaced by the canonical successor.",
    "2026-09-12T12:00:00.000Z"
  );
  result = review([], [linkedOld, newCanonical]);
  assert.equal(result.state, "READY");
  assert.deepEqual(result.currentLearning.map((item) => item.learningId), ["learning:new"]);

  const cycleNew = supersedeLearningV1(
    newCanonical,
    "learning:old",
    "Invalid circular replacement for regression coverage.",
    "2026-09-13T12:00:00.000Z"
  );
  result = review([], [linkedOld, cycleNew]);
  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("LEARNING_SUPERSESSION_CYCLE"));
  assert.deepEqual(result.currentLearning, []);
});

test("requires evidence on active canonical learning", () => {
  const canonical = canonicalLearning("learning:no-evidence");
  const unsupported = validateLearningObjectV1({
    ...canonical,
    evidence: []
  });
  const result = review([], [unsupported]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("CANONICAL_LEARNING_EVIDENCE_MISSING"));
  assert.deepEqual(result.currentLearning, []);
});

test("fails closed on widened decision authority", () => {
  const current = decision("decision:authority");
  const widened = {
    ...current,
    actionAuthority: {
      ...current.actionAuthority,
      externalActionAuthorized: true
    }
  } as unknown as DecisionMemoryRecordV1;
  const result = review([widened]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(issueCodes(result).includes("DECISION_AUTHORITY_WIDENED"));
  assert.deepEqual(result.currentDecisions, []);
});

test("is deterministic, deeply frozen, and never mutates supplied records", () => {
  const decisions = [decision("decision:b"), decision("decision:a")];
  const learning = [canonicalLearning("learning:b"), canonicalLearning("learning:a")];
  const decisionSnapshot = structuredClone(decisions);
  const learningSnapshot = structuredClone(learning);

  const first = reviewCompanyBrainKnowledgeIntegrityV1({
    generatedAt,
    decisionRecords: decisions,
    learningObjects: learning
  });
  const second = reviewCompanyBrainKnowledgeIntegrityV1({
    generatedAt,
    decisionRecords: [...decisions].reverse(),
    learningObjects: [...learning].reverse()
  });

  assert.deepEqual(first, second);
  assert.deepEqual(decisions, decisionSnapshot);
  assert.deepEqual(learning, learningSnapshot);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.currentDecisions));
  assert.ok(Object.isFrozen(first.currentLearning));
  assert.ok(Object.isFrozen(first.issues));
  assert.ok(first.currentDecisions.every(Object.isFrozen));
  assert.ok(first.currentLearning.every(Object.isFrozen));
});

test("rejects invalid configuration and bounded-input violations", () => {
  assert.throws(
    () => reviewCompanyBrainKnowledgeIntegrityV1({
      generatedAt: "not-a-timestamp",
      decisionRecords: [],
      learningObjects: []
    }),
    /INVALID_GENERATED_AT/
  );

  const repeated = Array.from(
    { length: MAX_COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_RECORDS_V1 + 1 },
    (_, index) => decision(`decision:${index}`)
  );
  assert.throws(
    () => reviewCompanyBrainKnowledgeIntegrityV1({
      generatedAt,
      decisionRecords: repeated,
      learningObjects: []
    }),
    /BOUNDS_EXCEEDED/
  );
});

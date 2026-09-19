import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainDecisionRevisitReviewV1,
  type DecisionRevisitObservationV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-revisit-review-v1";
import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-brief-v1";

const GENERATED_AT = "2026-09-19T13:00:00.000Z";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function sourceBrief(
  overrides: Partial<DecisionMemoryBriefV1> = {}
): DecisionMemoryBriefV1 {
  return {
    contractVersion: "DecisionMemoryBriefV1",
    policyVersion: DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
    briefId: "decision-memory-brief:strategy-1",
    generatedAt: "2026-09-19T12:00:00.000Z",
    state: "REVIEW_REQUIRED",
    lineageState: "NO_PRIOR",
    freshnessState: "CURRENT",
    decisionId: "decision:strategy-1",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-18T18:00:00.000Z",
    selectedAlternativeId: "alt:focus-a",
    selectedAlternativeLabel: "Focus on the documented priority",
    rationale: {
      state: "KNOWN",
      value: "Preserve optionality unless the recorded demand threshold is reached.",
      evidenceRefs: ["evidence:rationale:strategy-1"]
    },
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence:strategy-1"]
    },
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:00:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    },
    actionState: "TAKEN",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    changesSincePrior: [],
    revisitSignals: [
      {
        kind: "EXPLICIT_TRIGGER",
        ref: "revisit:1",
        text: "Revisit if documented demand reaches the pre-recorded threshold.",
        truthState: "NOT_APPLICABLE",
        evidenceRefs: []
      }
    ],
    provenanceRefs: [
      "evidence:approval:strategy-1",
      "evidence:confidence:strategy-1",
      "evidence:rationale:strategy-1",
      "source:strategy:strategy-1"
    ],
    integrityFlags: [],
    limitations: ["Source brief limitation."],
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function observation(
  overrides: Partial<DecisionRevisitObservationV1> = {}
): DecisionRevisitObservationV1 {
  return {
    observationId: "observation:strategy-1:revisit-1",
    decisionId: "decision:strategy-1",
    triggerRef: "revisit:1",
    triggerText: "Revisit if documented demand reaches the pre-recorded threshold.",
    observedAt: "2026-09-19T12:30:00.000Z",
    truthState: "KNOWN",
    assessment: "MET",
    evidenceRefs: ["evidence:demand-threshold"],
    sourceRefs: ["source:demand-system"],
    ...overrides
  };
}

function compile(
  briefs: readonly DecisionMemoryBriefV1[],
  triggerObservations: readonly DecisionRevisitObservationV1[]
) {
  return compileCompanyBrainDecisionRevisitReviewV1({
    briefs,
    triggerObservations,
    generatedAt: GENERATED_AT,
    maximumSourceAgeMs: MAX_AGE_MS,
    maximumObservationAgeMs: MAX_AGE_MS
  });
}

test("routes a fresh KNOWN exact trigger observation to governed decision revisit", () => {
  const result = compile([sourceBrief()], [observation()]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.explicitTriggers, 1);
  assert.equal(result.summary.revisitRequired, 1);
  assert.equal(result.summary.noRevisitSignal, 0);
  assert.equal(result.revisitRequired[0]?.assessment, "MET");
  assert.equal(result.revisitRequired[0]?.lane, "REVISIT_DECISION");
  assert.equal(result.revisitRequired[0]?.rationale.value, "Preserve optionality unless the recorded demand threshold is reached.");
  assert.deepEqual(result.revisitRequired[0]?.rationale.evidenceRefs, ["evidence:rationale:strategy-1"]);
  assert.deepEqual(result.revisitRequired[0]?.reasonCodes, ["TRIGGER_MET_EVIDENCE_RECORDED"]);
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.authority.decisionMutationAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("preserves a fresh KNOWN NOT_MET observation without inventing a revisit", () => {
  const result = compile([sourceBrief()], [observation({ assessment: "NOT_MET" })]);

  assert.equal(result.state, "READY");
  assert.equal(result.revisitRequired.length, 0);
  assert.equal(result.noRevisitSignal.length, 1);
  assert.equal(result.noRevisitSignal[0]?.lane, "NO_REVISIT_SIGNAL");
  assert.deepEqual(result.noRevisitSignal[0]?.reasonCodes, ["TRIGGER_NOT_MET_EVIDENCE_RECORDED"]);
});

test("waits when an explicit trigger has no observation instead of interpreting trigger prose", () => {
  const result = compile([sourceBrief()], []);

  assert.equal(result.state, "READY");
  assert.equal(result.waitingEvidence.length, 1);
  assert.equal(result.revisitRequired.length, 0);
  assert.equal(result.waitingEvidence[0]?.observationId, null);
  assert.deepEqual(result.waitingEvidence[0]?.reasonCodes, ["TRIGGER_OBSERVATION_MISSING"]);
});

test("requires verification when a non-KNOWN observation carries an assessment", () => {
  const result = compile(
    [sourceBrief()],
    [observation({ truthState: "INFERRED", assessment: "MET" })]
  );

  assert.equal(result.state, "VERIFY_EVIDENCE");
  assert.equal(result.revisitRequired.length, 0);
  assert.equal(result.verificationRequired.length, 1);
  assert.ok(
    result.verificationRequired[0]?.reasonCodes.includes("NON_KNOWN_OBSERVATION_CANNOT_ASSESS")
  );
});

test("fails closed on stale, future-dated, or pre-decision trigger observations", () => {
  const stale = compile(
    [sourceBrief()],
    [observation({ observedAt: "2026-09-19T10:00:00.000Z" })]
  );
  assert.equal(stale.state, "VERIFY_EVIDENCE");
  assert.ok(stale.verificationRequired[0]?.reasonCodes.includes("OBSERVATION_STALE"));

  const future = compile(
    [sourceBrief()],
    [observation({ observedAt: "2026-09-19T13:01:00.000Z" })]
  );
  assert.equal(future.state, "VERIFY_EVIDENCE");
  assert.ok(future.verificationRequired[0]?.reasonCodes.includes("OBSERVATION_FUTURE_DATED"));

  const beforeDecision = compile(
    [sourceBrief()],
    [observation({ observedAt: "2026-09-18T17:59:59.000Z" })]
  );
  assert.equal(beforeDecision.state, "VERIFY_EVIDENCE");
  assert.ok(beforeDecision.verificationRequired[0]?.reasonCodes.includes("OBSERVATION_BEFORE_DECISION"));
});

test("does not choose among duplicate trigger observations", () => {
  const result = compile(
    [sourceBrief()],
    [
      observation(),
      observation({
        observationId: "observation:strategy-1:revisit-1:second",
        assessment: "NOT_MET",
        evidenceRefs: ["evidence:demand-threshold:second"]
      })
    ]
  );

  assert.equal(result.state, "VERIFY_EVIDENCE");
  assert.equal(result.revisitRequired.length, 0);
  assert.equal(result.noRevisitSignal.length, 0);
  assert.equal(result.verificationRequired.length, 1);
  assert.deepEqual(result.verificationRequired[0]?.reasonCodes, ["DUPLICATE_TRIGGER_OBSERVATIONS"]);
});

test("requires exact trigger identity and rejects unbound observations", () => {
  const mismatch = compile(
    [sourceBrief()],
    [observation({ triggerText: "A different trigger statement." })]
  );
  assert.equal(mismatch.state, "VERIFY_EVIDENCE");
  assert.ok(mismatch.verificationRequired[0]?.reasonCodes.includes("TRIGGER_IDENTITY_MISMATCH"));

  const unbound = compile(
    [sourceBrief()],
    [observation({ triggerRef: "revisit:99" })]
  );
  assert.equal(unbound.state, "VERIFY_EVIDENCE");
  assert.equal(unbound.revisitRequired.length, 0);
  assert.equal(unbound.waitingEvidence.length, 1);
  assert.ok(
    unbound.verificationReasons.some((reason) =>
      reason.startsWith("OBSERVATION_DOES_NOT_BIND_TO_EXPLICIT_TRIGGER:")
    )
  );
});

test("fails closed on stale source truth, duplicate decisions, or widened source authority", () => {
  const stale = sourceBrief({
    briefId: "decision-memory-brief:stale",
    decisionId: "decision:stale",
    generatedAt: "2026-09-19T10:00:00.000Z"
  });
  const duplicateA = sourceBrief({
    briefId: "decision-memory-brief:duplicate-a",
    decisionId: "decision:duplicate"
  });
  const duplicateB = sourceBrief({
    briefId: "decision-memory-brief:duplicate-b",
    decisionId: "decision:duplicate"
  });
  const widened = sourceBrief({
    briefId: "decision-memory-brief:widened",
    decisionId: "decision:widened",
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: true,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    }
  });

  const result = compile([stale, duplicateA, duplicateB, widened], []);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.acceptedBriefs, 0);
  assert.equal(result.summary.rejectedBriefs, 4);
  assert.equal(result.timeline.length, 0);
  assert.ok(result.verificationReasons.includes("SOURCE_BRIEF_STALE:decision:stale"));
  assert.ok(result.verificationReasons.includes("SOURCE_DECISION_ID_DUPLICATE:decision:duplicate"));
  assert.ok(result.verificationReasons.includes("SOURCE_AUTHORITY_WIDENED:decision:widened"));
});

test("returns NO_SCOPE instead of a fake ready state when no explicit trigger is in scope", () => {
  const result = compile([sourceBrief({ revisitSignals: [] })], []);

  assert.equal(result.state, "NO_SCOPE");
  assert.equal(result.summary.explicitTriggers, 0);
  assert.equal(result.timeline.length, 0);
});

test("is deterministic, deeply frozen, and does not freeze or mutate caller inputs", () => {
  const brief = sourceBrief();
  const observed = observation();
  const beforeBrief = JSON.stringify(brief);
  const beforeObservation = JSON.stringify(observed);

  const first = compile([brief], [observed]);
  const second = compile([brief], [observed]);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(brief), beforeBrief);
  assert.equal(JSON.stringify(observed), beforeObservation);
  assert.equal(Object.isFrozen(brief), false);
  assert.equal(Object.isFrozen(observed), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.timeline), true);
  assert.equal(Object.isFrozen(first.timeline[0]), true);
  assert.equal(Object.isFrozen(first.timeline[0]?.rationale), true);
});

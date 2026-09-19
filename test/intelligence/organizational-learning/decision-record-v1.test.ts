import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_RECORD_CONTRACT_VERSION_V1,
  evaluateDecisionRecordV1,
} from "@/lib/intelligence/organizational-learning/decision-record-v1";

const EVALUATED_AT = "2026-09-19T06:30:00.000Z";

function record(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: DECISION_RECORD_CONTRACT_VERSION_V1,
    decisionId: "decision:studio-partner-1",
    version: 1,
    state: "ACTIVE",
    domain: "strategy",
    decision: "Use the governed partner path for the next studio financing review.",
    context: "The decision compares current bounded financing paths without asserting future funding.",
    evidenceRefs: ["evidence:financing-review-1", "evidence:partner-terms-1"],
    alternatives: [
      {
        alternativeId: "alternative:self-fund",
        summary: "Self-fund the same bounded scope.",
        disposition: "NOT_CHOSEN",
      },
    ],
    rationale: "The supplied evidence supports reviewing the partner path first while retaining the alternative.",
    confidence: 0.7,
    authority: {
      authorityClass: "HUMAN_APPROVED",
      actorRef: "actor:keegan",
      approvalRef: "approval:decision-1",
      approvedAt: "2026-09-18T20:00:00.000Z",
    },
    decidedAt: "2026-09-18T21:00:00.000Z",
    validUntil: "2026-12-01T00:00:00.000Z",
    revisitTriggers: [
      {
        triggerId: "trigger:new-terms",
        condition: "Material partner terms change.",
        evidenceRef: "evidence:partner-terms-1",
      },
    ],
    expectedOutcome: {
      statement: "Reach a better-supported financing choice after the bounded review.",
      metricRefs: ["metric:financing-option-completeness"],
    },
    successCriteria: ["A chosen path is supported by current verified terms."],
    failureCriteria: ["The review depends on stale or unverifiable terms."],
    action: {
      state: "NOT_TAKEN",
      externalAction: false,
      actedAt: null,
      evidenceRefs: [],
    },
    observedOutcome: null,
    supersession: null,
    ...overrides,
  };
}

test("a complete evidence-backed decision record is ready without inventing value or action authority", () => {
  const result = evaluateDecisionRecordV1(record(), EVALUATED_AT);

  assert.equal(result.status, "READY");
  assert.deepEqual(result.reasonCodes, ["DECISION_RECORD_VALIDATED"]);
  assert.equal(result.decisionId, "decision:studio-partner-1");
  assert.equal(result.causalClaimEstablished, false);
  assert.equal(result.monetaryValue, null);
  assert.equal(result.authority.persistenceAllowed, false);
  assert.equal(result.authority.externalActionAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
  assert.ok(result.record);
  assert.ok(Object.isFrozen(result.record));
});

test("missing optional judgment fields become review gaps rather than fabricated values", () => {
  const result = evaluateDecisionRecordV1(
    record({
      confidence: null,
      alternatives: [],
      expectedOutcome: null,
      revisitTriggers: [],
      validUntil: null,
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("CONFIDENCE_NOT_RECORDED"));
  assert.ok(result.reasonCodes.includes("ALTERNATIVES_NOT_RECORDED"));
  assert.ok(result.reasonCodes.includes("EXPECTED_OUTCOME_NOT_RECORDED"));
  assert.ok(result.reasonCodes.includes("REVISIT_TRIGGER_NOT_RECORDED"));
  assert.equal(result.record?.confidence, null);
  assert.equal(result.record?.expectedOutcome, null);
});

test("an executed external action cannot be recorded without governed or human approval evidence", () => {
  const result = evaluateDecisionRecordV1(
    record({
      authority: {
        authorityClass: "LOW_RISK_INTERNAL",
        actorRef: "actor:system",
        approvalRef: null,
        approvedAt: null,
      },
      action: {
        state: "TAKEN",
        externalAction: true,
        actedAt: "2026-09-18T22:00:00.000Z",
        evidenceRefs: ["evidence:external-action-1"],
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("EXTERNAL_ACTION_REQUIRES_APPROVAL_EVIDENCE"));
  assert.equal(result.record, null);
});

test("approved authority must carry explicit approval provenance", () => {
  const result = evaluateDecisionRecordV1(
    record({
      authority: {
        authorityClass: "HUMAN_APPROVED",
        actorRef: "actor:keegan",
        approvalRef: null,
        approvedAt: null,
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("APPROVED_AUTHORITY_REQUIRES_EVIDENCE"));
});

test("a recorded outcome cannot exist without a taken action", () => {
  const result = evaluateDecisionRecordV1(
    record({
      observedOutcome: {
        observedAt: "2026-09-19T01:00:00.000Z",
        summary: "An observed metric moved after the decision.",
        result: "POSITIVE",
        evidenceRefs: ["evidence:outcome-1"],
        confounders: [],
        attributionClass: "NOT_ESTABLISHED",
        attributionConfidence: null,
        causalDesignRef: null,
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("OUTCOME_WITHOUT_TAKEN_ACTION"));
});

test("causal attribution requires explicit causal-design evidence", () => {
  const result = evaluateDecisionRecordV1(
    record({
      action: {
        state: "TAKEN",
        externalAction: false,
        actedAt: "2026-09-18T22:00:00.000Z",
        evidenceRefs: ["evidence:action-1"],
      },
      observedOutcome: {
        observedAt: "2026-09-19T01:00:00.000Z",
        summary: "The outcome was measured after the action.",
        result: "POSITIVE",
        evidenceRefs: ["evidence:outcome-1"],
        confounders: ["Concurrent campaign activity was present."],
        attributionClass: "CAUSAL_SUPPORTED",
        attributionConfidence: 0.9,
        causalDesignRef: null,
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("CAUSAL_SUPPORT_REQUIRES_DESIGN_EVIDENCE"));
});

test("correlational outcome evidence stays explicitly non-causal", () => {
  const result = evaluateDecisionRecordV1(
    record({
      action: {
        state: "TAKEN",
        externalAction: false,
        actedAt: "2026-09-18T22:00:00.000Z",
        evidenceRefs: ["evidence:action-1"],
      },
      observedOutcome: {
        observedAt: "2026-09-19T01:00:00.000Z",
        summary: "A metric increased after the action, with known confounders.",
        result: "POSITIVE",
        evidenceRefs: ["evidence:outcome-1"],
        confounders: ["Organic traffic also increased."],
        attributionClass: "CORRELATIONAL",
        attributionConfidence: 0.4,
        causalDesignRef: null,
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "READY");
  assert.equal(result.record?.observedOutcome?.attributionClass, "CORRELATIONAL");
  assert.equal(result.causalClaimEstablished, false);
});

test("causal support is preserved only when explicit design and outcome evidence are supplied", () => {
  const result = evaluateDecisionRecordV1(
    record({
      action: {
        state: "TAKEN",
        externalAction: false,
        actedAt: "2026-09-18T22:00:00.000Z",
        evidenceRefs: ["evidence:action-1"],
      },
      observedOutcome: {
        observedAt: "2026-09-19T01:00:00.000Z",
        summary: "The predefined experiment produced the supplied observed result.",
        result: "POSITIVE",
        evidenceRefs: ["evidence:outcome-1"],
        confounders: [],
        attributionClass: "CAUSAL_SUPPORTED",
        attributionConfidence: 0.85,
        causalDesignRef: "experiment:randomized-1",
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "READY");
  assert.equal(result.causalClaimEstablished, true);
  assert.equal(result.record?.observedOutcome?.causalDesignRef, "experiment:randomized-1");
});

test("expired decisions require review instead of silently remaining current", () => {
  const result = evaluateDecisionRecordV1(
    record({ validUntil: "2026-09-18T23:00:00.000Z" }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.ok(result.reasonCodes.includes("DECISION_VALIDITY_EXPIRED"));
});

test("future-dated decisions and outcomes fail closed", () => {
  const futureDecision = evaluateDecisionRecordV1(
    record({ decidedAt: "2026-09-20T00:00:00.000Z" }),
    EVALUATED_AT,
  );
  assert.equal(futureDecision.status, "BLOCKED");
  assert.ok(futureDecision.reasonCodes.includes("DECISION_FUTURE_DATED"));

  const futureOutcome = evaluateDecisionRecordV1(
    record({
      action: {
        state: "TAKEN",
        externalAction: false,
        actedAt: "2026-09-18T22:00:00.000Z",
        evidenceRefs: ["evidence:action-1"],
      },
      observedOutcome: {
        observedAt: "2026-09-20T01:00:00.000Z",
        summary: "Future result.",
        result: "INCONCLUSIVE",
        evidenceRefs: ["evidence:outcome-1"],
        confounders: [],
        attributionClass: "NOT_ESTABLISHED",
        attributionConfidence: null,
        causalDesignRef: null,
      },
    }),
    EVALUATED_AT,
  );
  assert.equal(futureOutcome.status, "BLOCKED");
  assert.ok(futureOutcome.reasonCodes.includes("OUTCOME_FUTURE_DATED"));
});

test("supersession preserves predecessor lineage and rejects self-supersession", () => {
  const valid = evaluateDecisionRecordV1(
    record({
      decisionId: "decision:new",
      state: "SUPERSEDED",
      supersession: {
        supersedesDecisionId: "decision:old",
        reason: "New verified terms changed the governing choice.",
        predecessorEvidenceRef: "decision-record:old:v1",
      },
    }),
    EVALUATED_AT,
  );
  assert.equal(valid.status, "READY");
  assert.equal(valid.record?.supersession?.supersedesDecisionId, "decision:old");

  const self = evaluateDecisionRecordV1(
    record({
      decisionId: "decision:same",
      state: "SUPERSEDED",
      supersession: {
        supersedesDecisionId: "decision:same",
        reason: "Invalid self overwrite.",
        predecessorEvidenceRef: "decision-record:same:v1",
      },
    }),
    EVALUATED_AT,
  );
  assert.equal(self.status, "BLOCKED");
  assert.ok(self.reasonCodes.includes("INVALID_SUPERSESSION"));
});

test("a non-superseded decision cannot smuggle in supersession metadata", () => {
  const result = evaluateDecisionRecordV1(
    record({
      supersession: {
        supersedesDecisionId: "decision:old",
        reason: "Unexpected metadata.",
        predecessorEvidenceRef: "decision-record:old:v1",
      },
    }),
    EVALUATED_AT,
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("UNEXPECTED_SUPERSESSION"));
});

test("missing decision provenance blocks the record instead of upgrading narrative to truth", () => {
  const result = evaluateDecisionRecordV1(record({ evidenceRefs: [] }), EVALUATED_AT);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasonCodes.includes("DECISION_EVIDENCE_REQUIRED"));
});

import assert from "node:assert/strict";
import { test } from "node:test";

import type { RelationshipStateProjectionV1 } from "../../src/lib/email/ionos-relationship-state-v1";
import type { CanonicalRelationshipFollowUpQueueItemV1 } from "../../src/lib/relationships-crm/canonical-follow-up-queue-v1";
import { selectRelationshipNextActionConfidenceV2 } from "../../src/lib/relationship-intelligence/relationship-next-action-confidence-v2";

function projection(overrides: Partial<RelationshipStateProjectionV1> = {}): RelationshipStateProjectionV1 {
  return {
    projectionId: "projection-1",
    threadId: "thread-1",
    contactId: "contact-1",
    opportunityIds: [],
    mailboxRoles: ["SALES"],
    primaryState: "NEEDS_REPLY",
    states: ["NEEDS_REPLY"],
    lastMeaningfulInteraction: null,
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    activeAskIds: [],
    commitmentSuggestionIds: [],
    evidenceRefs: ["evidence-1"],
    evidenceFingerprint: "fingerprint-1",
    decisionEligible: true,
    nextBestMove: {
      move: "PREPARE_REPLY",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["evidence-1"],
      blockingConditions: [],
      whatWouldChange: []
    },
    supersedesProjectionId: null,
    priorState: null,
    ...overrides
  };
}

function followUp(overrides: Partial<CanonicalRelationshipFollowUpQueueItemV1> = {}): CanonicalRelationshipFollowUpQueueItemV1 {
  return {
    itemId: "queue-1",
    projectionId: "projection-1",
    contactId: "contact-1",
    threadId: "thread-1",
    opportunityIds: [],
    queueClasses: ["FOLLOW_UP_THIS_WEEK"],
    primaryQueueClass: "FOLLOW_UP_THIS_WEEK",
    priority: 50,
    dueAt: "2026-09-15T00:00:00.000Z",
    lastMeaningfulInteractionAt: "2026-09-14T00:00:00.000Z",
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    requiresReview: false,
    suggestedMove: "PREPARE_FOLLOW_UP",
    followUpIds: ["follow-up-1"],
    evidenceRefs: ["evidence-2"],
    ...overrides
  };
}

const primaryAuthority = { "evidence-1": "PRIMARY", "evidence-2": "PRIMARY", "evidence-3": "PRIMARY" } as const;

test("selects a supported reply from current primary evidence", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection(),
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(result.assessment, "SUPPORTED");
  assert.equal(result.action?.move, "PREPARE_REPLY");
  assert.equal(result.action?.confidence, "HIGH");
  assert.deepEqual(result.action?.reasonCodes, ["REPLY_REQUIRED"]);
});

test("fails closed for stale evidence", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ freshnessState: "STALE" }),
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(result.assessment, "STALE");
  assert.equal(result.action?.move, "VERIFY_EVIDENCE");
  assert.deepEqual(result.action?.reasonCodes, ["STALE_EVIDENCE"]);
});

test("conflict outranks otherwise actionable follow-ups", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection(),
    followUps: [followUp({ truthState: "CONFLICTED", queueClasses: ["OVERDUE"], primaryQueueClass: "OVERDUE" })],
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(result.assessment, "CONFLICTED");
  assert.deepEqual(result.action?.reasonCodes, ["CONFLICTED_EVIDENCE"]);
});

test("returns no action when canonical evidence is missing", () => {
  const result = selectRelationshipNextActionConfidenceV2({ relationshipId: "contact-1", projection: null });
  assert.equal(result.assessment, "UNKNOWN");
  assert.equal(result.action, null);
});

test("preserves unknown evidence state instead of coercing it", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ truthState: "UNKNOWN", primaryState: "UNKNOWN", states: ["UNKNOWN"] }),
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(result.assessment, "UNKNOWN");
  assert.equal(result.action?.confidence, "UNKNOWN");
  assert.deepEqual(result.action?.reasonCodes, ["MISSING_EVIDENCE"]);
});

test("authority limits block a supported business action", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection(),
    evidenceAuthorityByRef: { "evidence-1": "SECONDARY" }
  });
  assert.equal(result.assessment, "AUTHORITY_LIMITED");
  assert.equal(result.action?.move, "VERIFY_EVIDENCE");
  assert.deepEqual(result.action?.reasonCodes, ["INSUFFICIENT_AUTHORITY"]);
});

test("overdue follow-up outranks active opportunity context", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ primaryState: "NO_ACTION", states: ["NO_ACTION"], opportunityIds: ["opp-1"] }),
    followUps: [followUp({ queueClasses: ["OVERDUE"], primaryQueueClass: "OVERDUE", opportunityIds: ["opp-1"] })],
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.deepEqual(result.action?.reasonCodes, ["OVERDUE_FOLLOW_UP"]);
  assert.deepEqual(result.action?.opportunityIds, ["opp-1"]);
  assert.deepEqual(result.action?.followUpIds, ["follow-up-1"]);
});

test("active opportunity produces one bounded follow-up action", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ primaryState: "NO_ACTION", states: ["NO_ACTION"], opportunityIds: ["opp-2", "opp-1"] }),
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.deepEqual(result.action?.reasonCodes, ["ACTIVE_OPPORTUNITY"]);
  assert.deepEqual(result.action?.opportunityIds, ["opp-1", "opp-2"]);
  assert.equal(Array.isArray(result.action) ? result.action.length : 1, 1);
});

test("deterministic follow-up ranking and evidence ordering ignore input order", () => {
  const low = followUp({ itemId: "queue-z", priority: 10, evidenceRefs: ["evidence-3"], followUpIds: ["follow-up-3"] });
  const high = followUp({ itemId: "queue-a", priority: 90, evidenceRefs: ["evidence-2"], followUpIds: ["follow-up-2"] });
  const left = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ primaryState: "NO_ACTION", states: ["NO_ACTION"] }),
    followUps: [low, high],
    evidenceAuthorityByRef: primaryAuthority
  });
  const right = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection({ primaryState: "NO_ACTION", states: ["NO_ACTION"] }),
    followUps: [high, low],
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.deepEqual(left, right);
  assert.deepEqual(left.action?.evidenceRefs, ["evidence-1", "evidence-2", "evidence-3"]);
});

test("does not mutate inputs and returns deeply immutable output", () => {
  const sourceProjection = projection();
  const sourceFollowUp = followUp();
  const before = JSON.stringify({ sourceProjection, sourceFollowUp });
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: sourceProjection,
    followUps: [sourceFollowUp],
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(JSON.stringify({ sourceProjection, sourceFollowUp }), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.action), true);
  assert.equal(Object.isFrozen(result.action?.evidenceRefs), true);
});

test("never grants outbound or write authority", () => {
  const result = selectRelationshipNextActionConfidenceV2({
    relationshipId: "contact-1",
    projection: projection(),
    evidenceAuthorityByRef: primaryAuthority
  });
  assert.equal(result.outboundAllowed, false);
  assert.equal(result.writeAllowed, false);
  assert.equal("send" in result, false);
  assert.equal("write" in result, false);
});

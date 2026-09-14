import assert from "node:assert/strict";
import test from "node:test";

import {
  projectCanonicalRelationshipFollowUpQueueV1,
  type CanonicalRelationshipFollowUpQueueInputV1
} from "../../src/lib/relationships-crm/canonical-follow-up-queue-v1";
import type { RelationshipStateProjectionV1 } from "../../src/lib/email/ionos-relationship-state-v1";

const NOW = "2026-09-14T00:00:00.000Z";

function projection(overrides: Partial<RelationshipStateProjectionV1> = {}): RelationshipStateProjectionV1 {
  return {
    projectionId: "projection-1",
    threadId: "thread-1",
    contactId: "contact-1",
    opportunityIds: ["opportunity-1"],
    mailboxRoles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP"],
    primaryState: "WAITING_ON_CONTACT",
    states: ["WAITING_ON_CONTACT"],
    lastMeaningfulInteraction: {
      activityId: "activity-1",
      canonicalEmailId: "email-1",
      effectiveTimestamp: "2026-09-12T00:00:00.000Z",
      direction: "OUTBOUND",
      mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
      expectsReply: true
    },
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    activeAskIds: [],
    commitmentSuggestionIds: [],
    evidenceRefs: ["email:1"],
    evidenceFingerprint: "fingerprint-1",
    decisionEligible: true,
    nextBestMove: {
      move: "WAIT_FOR_CONTACT",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["email:1"],
      blockingConditions: [],
      whatWouldChange: []
    },
    supersedesProjectionId: null,
    priorState: null,
    ...overrides
  };
}

function input(overrides: Partial<CanonicalRelationshipFollowUpQueueInputV1> = {}): CanonicalRelationshipFollowUpQueueInputV1 {
  return { projections: [projection()], now: NOW, ...overrides };
}

test("projects each dashboard queue class from canonical evidence", () => {
  const projections = [
    projection({ projectionId: "needs", states: ["NEEDS_REPLY"], primaryState: "NEEDS_REPLY" }),
    projection({ projectionId: "waiting", threadId: "thread-waiting" }),
    projection({ projectionId: "stale", threadId: "thread-stale", states: ["STALE_OPPORTUNITY", "HIGH_VALUE"], opportunityIds: ["opportunity-stale"] }),
    projection({
      projectionId: "reengaged",
      threadId: "thread-reengaged",
      priorState: { projectionId: "old", generatedAt: "2026-09-01T00:00:00.000Z", states: ["STALE_THREAD"] }
    }),
    projection({ projectionId: "unknown", threadId: "thread-unknown", truthState: "UNKNOWN", freshnessState: "UNKNOWN", decisionEligible: false, states: ["UNKNOWN"] })
  ];
  const result = projectCanonicalRelationshipFollowUpQueueV1(input({
    projections,
    followUps: [
      { followUpId: "overdue", contactId: "contact-1", threadId: "thread-waiting", dueAt: "2026-09-13T00:00:00Z", status: "OPEN", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["followup:overdue"], observedAt: "2026-09-13T00:00:00Z" },
      { followUpId: "this-week", contactId: "contact-1", threadId: "thread-stale", opportunityId: "opportunity-stale", dueAt: "2026-09-18T00:00:00Z", status: "OPEN", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["followup:week"], observedAt: "2026-09-13T00:00:00Z" }
    ]
  }));

  assert.equal(result.counts.NEEDS_REPLY, 1);
  assert.equal(result.counts.WAITING_ON_CONTACT, 2);
  assert.equal(result.counts.OVERDUE, 1);
  assert.equal(result.counts.FOLLOW_UP_THIS_WEEK, 1);
  assert.equal(result.counts.STALE_OPPORTUNITY, 1);
  assert.equal(result.counts.HIGH_VALUE, 1);
  assert.equal(result.counts.RECENTLY_REENGAGED, 1);
  assert.equal(result.counts.REQUIRES_VERIFICATION, 1);
});

test("deduplicates queue items and follow-up evidence deterministically", () => {
  const result = projectCanonicalRelationshipFollowUpQueueV1(input({
    projections: [projection({ states: ["WAITING_ON_CONTACT", "HIGH_VALUE"] })],
    followUps: [
      { followUpId: "follow-2", contactId: "contact-1", threadId: "thread-1", dueAt: "2026-09-19T00:00:00Z", status: "OPEN", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["ref:b", "ref:a"], observedAt: "2026-09-13T00:00:00Z" },
      { followUpId: "follow-1", contactId: "contact-1", opportunityId: "opportunity-1", dueAt: "2026-09-18T00:00:00Z", status: "OPEN", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["ref:a"], observedAt: "2026-09-13T00:00:00Z" }
    ]
  }));
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].followUpIds, ["follow-1", "follow-2"]);
  assert.deepEqual(result.items[0].evidenceRefs, ["email:1", "ref:a", "ref:b"]);
  assert.equal(result.items[0].dueAt, "2026-09-18T00:00:00.000Z");
});

test("preserves conflicted, stale, ambiguous, and unknown-date evidence as review-required", () => {
  const result = projectCanonicalRelationshipFollowUpQueueV1(input({
    projections: [projection({ truthState: "CONFLICTED", freshnessState: "STALE", decisionEligible: false, states: ["CONFLICTED"] })],
    identities: [{ contactId: "contact-1", state: "AMBIGUOUS", evidenceRefs: ["identity:ambiguous"] }],
    followUps: [{ followUpId: "unknown-date", contactId: "contact-1", threadId: "thread-1", dueAt: null, status: "OPEN", truthState: "UNKNOWN", freshnessState: "UNKNOWN", evidenceRefs: ["followup:unknown"], observedAt: "2026-09-13T00:00:00Z" }]
  }));
  const item = result.items[0];
  assert.equal(item.primaryQueueClass, "REQUIRES_VERIFICATION");
  assert.equal(item.requiresReview, true);
  assert.equal(item.suggestedMove, "VERIFY_EVIDENCE");
  assert.equal(item.dueAt, null);
  assert.equal(item.queueClasses.includes("OVERDUE"), false);
  assert.equal(item.queueClasses.includes("FOLLOW_UP_THIS_WEEK"), false);
});

test("ranks verification and overdue work before actionable current evidence", () => {
  const projections = [
    projection({ projectionId: "reply", threadId: "reply", states: ["NEEDS_REPLY"], primaryState: "NEEDS_REPLY" }),
    projection({ projectionId: "verify", threadId: "verify", states: ["UNKNOWN"], primaryState: "UNKNOWN", truthState: "UNKNOWN", freshnessState: "UNKNOWN", decisionEligible: false }),
    projection({ projectionId: "overdue", threadId: "overdue" })
  ];
  const result = projectCanonicalRelationshipFollowUpQueueV1(input({
    projections,
    followUps: [{ followUpId: "overdue-1", contactId: "contact-1", threadId: "overdue", dueAt: "2026-09-12T00:00:00Z", status: "OPEN", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["followup:1"], observedAt: "2026-09-13T00:00:00Z" }]
  }));
  assert.deepEqual(result.items.map((item) => item.projectionId), ["verify", "overdue", "reply"]);
  assert.deepEqual(result.items.map((item) => item.priority), [1, 2, 3]);
});

test("is bounded, rejects unsupported fields, and never mutates caller data", () => {
  const source = input({ projections: [projection()] });
  const before = structuredClone(source);
  const result = projectCanonicalRelationshipFollowUpQueueV1(source);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.items[0]), true);
  assert.throws(() => projectCanonicalRelationshipFollowUpQueueV1({ ...source, secret: "no" } as never), /unsupported key secret/);
  assert.throws(() => projectCanonicalRelationshipFollowUpQueueV1(input({ projections: Array.from({ length: 5_001 }, (_, index) => projection({ projectionId: `p-${index}` })) })), /exceeds 5000/);
});

test("completed and cancelled follow-ups do not create due-date queues", () => {
  const result = projectCanonicalRelationshipFollowUpQueueV1(input({
    followUps: [
      { followUpId: "complete", contactId: "contact-1", threadId: "thread-1", dueAt: "2026-09-01T00:00:00Z", status: "COMPLETED", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["complete:1"], observedAt: "2026-09-13T00:00:00Z" },
      { followUpId: "cancel", contactId: "contact-1", threadId: "thread-1", dueAt: "2026-09-01T00:00:00Z", status: "CANCELLED", truthState: "KNOWN", freshnessState: "CURRENT", evidenceRefs: ["cancel:1"], observedAt: "2026-09-13T00:00:00Z" }
    ]
  }));
  assert.equal(result.counts.OVERDUE, 0);
  assert.equal(result.counts.FOLLOW_UP_THIS_WEEK, 0);
  assert.deepEqual(result.items[0].followUpIds, ["cancel", "complete"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  projectDormantEmailOpportunitiesV1,
  type DormantCanonicalActivityV1,
  type DormantTruthStateV1
} from "../../src/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";

const NOW = "2026-09-18T04:00:00.000Z";

function activity(overrides: Partial<DormantCanonicalActivityV1> = {}): DormantCanonicalActivityV1 {
  return {
    activityId: "activity-1",
    conversationKey: "conversation-1",
    occurredAt: "2026-08-01T12:00:00.000Z",
    sourceRef: "email:canonical-1",
    evidenceRefs: ["evidence:1"],
    truthState: "KNOWN",
    threadState: "OPEN",
    businessSignal: "PARTNERSHIP_DISCUSSION",
    direction: "INBOUND",
    personRef: "person:partner",
    organizationRef: "org:partner",
    opportunityRef: null,
    explicitNextStep: null,
    nextStepState: null,
    dedupeKey: "thread:1",
    ...overrides
  };
}

function project(activities: readonly DormantCanonicalActivityV1[], maximumQueueSize = 20) {
  return projectDormantEmailOpportunitiesV1({ activities, now: NOW, minimumDormantDays: 14, maximumQueueSize });
}

test("queues an unresolved business discussion without inventing economics or authority", () => {
  const result = project([activity()]);
  const candidate = result.queue[0];

  assert.equal(candidate.candidateClass, "UNRESOLVED_BUSINESS_DISCUSSION");
  assert.equal(candidate.businessSignal, "PARTNERSHIP_DISCUSSION");
  assert.equal(candidate.ownerRecommendation, "KEEGAN");
  assert.match(candidate.safeNextStep, /do not send automatically/i);
  assert.equal("dealValue" in candidate, false);
  assert.equal("authority" in candidate, false);
});

test("maps explicit follow-up, inbound art interest, warm intro, and strategic relationship to bounded candidate classes", () => {
  const result = project([
    activity({ activityId: "follow", conversationKey: "follow", dedupeKey: "follow", businessSignal: "EXPLICIT_FOLLOW_UP", explicitNextStep: "Send revised concept after approval", nextStepState: "OPEN" }),
    activity({ activityId: "art", conversationKey: "art", dedupeKey: "art", businessSignal: "ART_INTEREST", direction: "INBOUND" }),
    activity({ activityId: "intro", conversationKey: "intro", dedupeKey: "intro", businessSignal: "WARM_INTRO", direction: "INBOUND" }),
    activity({ activityId: "strategic", conversationKey: "strategic", dedupeKey: "strategic", businessSignal: "STRATEGIC_RELATIONSHIP" })
  ]);

  const classes = new Map(result.queue.map((candidate) => [candidate.conversationKey, candidate.candidateClass]));
  assert.equal(classes.get("follow"), "OVERDUE_EXPLICIT_FOLLOW_UP");
  assert.equal(classes.get("art"), "INBOUND_INTEREST");
  assert.equal(classes.get("intro"), "WARM_INTRO");
  assert.equal(classes.get("strategic"), "STALE_STRATEGIC_RELATIONSHIP");
});

test("recommends Ioana for documented commission or purchase interest", () => {
  const result = project([
    activity({ activityId: "commission", conversationKey: "commission", dedupeKey: "commission", businessSignal: "COMMISSION_INTEREST" }),
    activity({ activityId: "purchase", conversationKey: "purchase", dedupeKey: "purchase", businessSignal: "PURCHASE" })
  ]);

  assert.deepEqual(result.queue.map((candidate) => candidate.ownerRecommendation), ["IOANA", "IOANA"]);
});

test("does not turn ordinary old correspondence into an opportunity", () => {
  const result = project([activity({ businessSignal: "NONE" })]);

  assert.equal(result.queue.length, 0);
  assert.deepEqual(result.suppressed[0].reasonCodes, ["NO_EXPLICIT_BUSINESS_SIGNAL"]);
});

test("suppresses resolved, rejected, won, lost, and irrelevant latest states", () => {
  const states = ["RESOLVED", "REJECTED", "WON", "LOST", "IRRELEVANT"] as const;
  const result = project(states.map((threadState, index) => activity({
    activityId: `terminal-${threadState}`,
    conversationKey: `terminal-${threadState}`,
    dedupeKey: `terminal-${index}`,
    threadState
  })));

  assert.equal(result.queue.length, 0);
  assert.equal(result.suppressed.length, 5);
  for (const item of result.suppressed) assert.ok(item.reasonCodes.some((reason) => reason.startsWith("LATEST_THREAD_STATE_")));
});

test("newer explicit completion suppresses an older open follow-up", () => {
  const result = project([
    activity({
      activityId: "older-followup",
      conversationKey: "same-thread",
      dedupeKey: "same-thread",
      occurredAt: "2026-07-01T12:00:00Z",
      businessSignal: "EXPLICIT_FOLLOW_UP",
      explicitNextStep: "Reconnect after the event",
      nextStepState: "OPEN"
    }),
    activity({
      activityId: "newer-completion",
      conversationKey: "same-thread",
      dedupeKey: "same-thread",
      occurredAt: "2026-08-15T12:00:00Z",
      businessSignal: "NONE",
      nextStepState: "COMPLETED",
      threadState: "ACTIVE"
    })
  ]);

  assert.equal(result.queue.length, 0);
  assert.ok(result.suppressed[0].reasonCodes.includes("LATEST_NEXT_STEP_COMPLETED"));
});

test("collapses duplicate canonical evidence into one candidate", () => {
  const result = project([
    activity({ activityId: "copy-a", conversationKey: "thread-a", dedupeKey: "canonical:abc", sourceRef: "email:a" }),
    activity({ activityId: "copy-b", conversationKey: "thread-b", dedupeKey: "canonical:abc", sourceRef: "crm:b", occurredAt: "2026-08-02T12:00:00Z" })
  ]);

  assert.equal(result.queue.length, 1);
  assert.deepEqual(result.queue[0].activityRefs, ["copy-b", "copy-a"]);
  assert.deepEqual(result.queue[0].sourceRefs, ["crm:b", "email:a"]);
});

test("preserves UNKNOWN, STALE, CONFLICTED, and PARTIAL truth with safe owners", () => {
  const states: DormantTruthStateV1[] = ["UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"];
  const result = project(states.map((truthState, index) => activity({
    activityId: `truth-${truthState}`,
    conversationKey: `truth-${truthState}`,
    dedupeKey: `truth-${index}`,
    truthState
  })));

  const owners = new Map(result.queue.map((candidate) => [candidate.truthState, candidate.ownerRecommendation]));
  assert.equal(owners.get("UNKNOWN"), "WAIT");
  assert.equal(owners.get("CONFLICTED"), "WAIT");
  assert.equal(owners.get("STALE"), "JEEVES_PREP");
  assert.equal(owners.get("PARTIAL"), "JEEVES_PREP");
});

test("suppresses ambiguous identity instead of fabricating a relationship", () => {
  const result = project([activity({ personRef: null, organizationRef: null, opportunityRef: null })]);

  assert.equal(result.queue.length, 0);
  assert.ok(result.suppressed[0].reasonCodes.includes("AMBIGUOUS_IDENTITY"));
});

test("requires dormancy in addition to an explicit business signal", () => {
  const result = project([activity({ occurredAt: "2026-09-12T12:00:00Z" })]);

  assert.equal(result.queue.length, 0);
  assert.ok(result.suppressed[0].reasonCodes.includes("NOT_DORMANT_YET"));
});

test("ranks deterministically, caps the queue, and marks overflow without creating filler", () => {
  const result = project([
    activity({ activityId: "strategic", conversationKey: "strategic", dedupeKey: "strategic", businessSignal: "STRATEGIC_RELATIONSHIP", occurredAt: "2026-06-01T12:00:00Z" }),
    activity({ activityId: "sponsor", conversationKey: "sponsor", dedupeKey: "sponsor", businessSignal: "SPONSORSHIP", occurredAt: "2026-08-01T12:00:00Z" }),
    activity({ activityId: "license", conversationKey: "license", dedupeKey: "license", businessSignal: "LICENSING", occurredAt: "2026-07-01T12:00:00Z" })
  ], 2);

  assert.deepEqual(result.queue.map((candidate) => candidate.conversationKey), ["sponsor", "license"]);
  assert.equal(result.suppressed.length, 1);
  assert.deepEqual(result.suppressed[0].reasonCodes, ["QUEUE_LIMIT_REACHED"]);
});

test("is deterministic, deeply immutable, and performs zero side effects", () => {
  const input = { activities: [activity()], now: NOW, minimumDormantDays: 14 } as const;
  const first = projectDormantEmailOpportunitiesV1(input);
  const second = projectDormantEmailOpportunitiesV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.mailboxMutationPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.queue), true);
  assert.equal(Object.isFrozen(first.queue[0]), true);
});

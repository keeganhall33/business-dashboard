import assert from "node:assert/strict";
import test from "node:test";

import * as inboxModule from "@/lib/email/ionos-intelligent-inbox-v1";
import {
  projectIonosIntelligentInboxV1,
  type IonosIntelligentInboxInputV1
} from "@/lib/email/ionos-intelligent-inbox-v1";
import type {
  IonosRelationshipStateResultV1,
  RelationshipStateProjectionV1,
  RelationshipStateV1
} from "@/lib/email/ionos-relationship-state-v1";

const NOW = "2026-09-08T18:10:00.000Z";
const PERSONAL = "PERSONAL_HIGH_VALUE_RELATIONSHIP" as const;
const ASSISTANT = "ASSISTANT_CUSTOMER_SERVICE_OUTREACH" as const;
const MARKETING = "MARKETING_FUNNELKIT" as const;

function projection(
  overrides: Partial<RelationshipStateProjectionV1> & { projectionId?: string } = {}
): RelationshipStateProjectionV1 {
  const projectionId = overrides.projectionId ?? "projection-1";
  const evidenceRef = `private-evidence-${projectionId}`;
  return {
    projectionId,
    threadId: `thread-${projectionId}`,
    contactId: `contact-${projectionId}`,
    opportunityIds: [],
    mailboxRoles: [PERSONAL],
    primaryState: "NEEDS_REPLY",
    states: ["NEEDS_REPLY"],
    lastMeaningfulInteraction: {
      activityId: `activity-${projectionId}`,
      canonicalEmailId: `email-${projectionId}`,
      effectiveTimestamp: "2026-09-08T17:00:00.000Z",
      direction: "INBOUND",
      mailboxRole: PERSONAL,
      expectsReply: true
    },
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    activeAskIds: [],
    commitmentSuggestionIds: [],
    evidenceRefs: [evidenceRef],
    evidenceFingerprint: `fingerprint-${projectionId}`,
    decisionEligible: true,
    nextBestMove: {
      move: "PREPARE_REPLY",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: [evidenceRef],
      blockingConditions: [],
      whatWouldChange: []
    },
    supersedesProjectionId: null,
    priorState: null,
    ...overrides
  };
}

function relationshipState(projections: readonly RelationshipStateProjectionV1[]): IonosRelationshipStateResultV1 {
  return {
    generatedAt: NOW,
    projections,
    telemetry: {
      projectionCount: projections.length,
      needsReplyCount: projections.filter((item) => item.primaryState === "NEEDS_REPLY").length,
      waitingOnContactCount: projections.filter((item) => item.primaryState === "WAITING_ON_CONTACT").length,
      staleThreadCount: projections.filter((item) => item.states.includes("STALE_THREAD")).length,
      staleOpportunityCount: projections.filter((item) => item.states.includes("STALE_OPPORTUNITY")).length,
      highValueCount: projections.filter((item) => item.states.includes("HIGH_VALUE")).length,
      unknownCount: projections.filter((item) => item.truthState === "UNKNOWN").length,
      conflictedCount: projections.filter((item) => item.truthState === "CONFLICTED").length,
      projectionFingerprints: projections.map((item) => item.evidenceFingerprint)
    }
  };
}

function input(
  projections: readonly RelationshipStateProjectionV1[],
  overrides: Partial<IonosIntelligentInboxInputV1> = {}
): IonosIntelligentInboxInputV1 {
  return {
    relationshipState: relationshipState(projections),
    attentionBudget: 10,
    ...overrides
  };
}

function withStates(
  id: string,
  primaryState: RelationshipStateProjectionV1["primaryState"],
  states: readonly RelationshipStateV1[],
  overrides: Partial<RelationshipStateProjectionV1> = {}
): RelationshipStateProjectionV1 {
  return projection({ projectionId: id, primaryState, states, ...overrides });
}

test("projects relationship states into the required intelligent-inbox queues", () => {
  const needs = withStates("needs", "NEEDS_REPLY", ["NEEDS_REPLY"]);
  const waiting = withStates("waiting", "WAITING_ON_CONTACT", ["WAITING_ON_CONTACT"], {
    lastMeaningfulInteraction: {
      activityId: "activity-waiting",
      canonicalEmailId: "email-waiting",
      effectiveTimestamp: "2026-09-08T16:00:00.000Z",
      direction: "OUTBOUND",
      mailboxRole: ASSISTANT,
      expectsReply: true
    },
    mailboxRoles: [ASSISTANT],
    nextBestMove: {
      move: "WAIT_FOR_CONTACT",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-waiting"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });
  const stale = withStates("stale", "WAITING_ON_CONTACT", ["WAITING_ON_CONTACT", "STALE_OPPORTUNITY"], {
    opportunityIds: ["opportunity-stale"],
    lastMeaningfulInteraction: {
      activityId: "activity-stale",
      canonicalEmailId: "email-stale",
      effectiveTimestamp: "2026-08-01T16:00:00.000Z",
      direction: "OUTBOUND",
      mailboxRole: PERSONAL,
      expectsReply: true
    }
  });
  const high = withStates("high", "NO_ACTION", ["NO_ACTION", "HIGH_VALUE"], {
    lastMeaningfulInteraction: null,
    nextBestMove: {
      move: "NO_ACTION",
      status: "NOT_APPLICABLE",
      evidenceRefs: ["private-evidence-high"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });
  const commitment = withStates("commitment", "NO_ACTION", ["NO_ACTION", "COMMITMENT_SUGGESTED"], {
    commitmentSuggestionIds: ["commitment-1"],
    nextBestMove: {
      move: "PREPARE_FOLLOW_UP",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-commitment"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });
  const followUp = withStates("follow-up", "NO_ACTION", ["NO_ACTION", "FOLLOW_UP_SUGGESTED"], {
    lastMeaningfulInteraction: {
      activityId: "activity-follow-up",
      canonicalEmailId: "email-follow-up",
      effectiveTimestamp: "2026-09-06T16:00:00.000Z",
      direction: "OUTBOUND",
      mailboxRole: PERSONAL,
      expectsReply: false
    },
    nextBestMove: {
      move: "PREPARE_FOLLOW_UP",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-follow-up"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });

  const result = projectIonosIntelligentInboxV1(input([needs, waiting, stale, high, commitment, followUp]));

  assert.deepEqual(result.needsReply.map((item) => item.id), ["needs"]);
  assert.deepEqual(result.waitingOnContact.map((item) => item.id), ["waiting", "stale"]);
  assert.deepEqual(result.staleOpportunities.map((item) => item.id), ["stale"]);
  assert.deepEqual(result.highValue.map((item) => item.id), ["high"]);
  assert.deepEqual(result.suggestedCommitments.map((item) => item.id), ["commitment"]);
  assert.deepEqual(result.suggestedFollowUps.map((item) => item.id), ["follow-up"]);
  assert.deepEqual(result.recentReplies.map((item) => item.id), ["needs"]);
});

test("preserves cross-mailbox roles and safe canonical deep links without duplicating a projection", () => {
  const multi = projection({
    projectionId: "multi",
    mailboxRoles: [PERSONAL, ASSISTANT, MARKETING]
  });
  const result = projectIonosIntelligentInboxV1(input([multi], {
    deepLinks: { multi: "/relationships/contact-multi" }
  }));

  assert.deepEqual(result.needsReply[0].mailboxRoles, [PERSONAL, ASSISTANT, MARKETING]);
  assert.equal(result.needsReply[0].deepLink, "/relationships/contact-multi");
  assert.equal(result.telemetry.projectionCount, 1);
});

test("UNKNOWN STALE and CONFLICTED evidence stays in requiresVerification and cannot become actionable certainty", () => {
  const unknown = withStates("unknown", "UNKNOWN", ["UNKNOWN"], {
    truthState: "UNKNOWN",
    decisionEligible: false,
    nextBestMove: {
      move: "VERIFY_EVIDENCE",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-unknown"],
      blockingConditions: ["UNKNOWN_EVIDENCE"],
      whatWouldChange: ["KNOWN_EVIDENCE"]
    }
  });
  const stale = withStates("stale-evidence", "WAITING_ON_CONTACT", ["WAITING_ON_CONTACT"], {
    freshnessState: "STALE",
    decisionEligible: false,
    nextBestMove: {
      move: "VERIFY_EVIDENCE",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-stale-evidence"],
      blockingConditions: ["STALE_EVIDENCE"],
      whatWouldChange: ["CURRENT_EVIDENCE"]
    }
  });
  const conflicted = withStates("conflicted", "CONFLICTED", ["CONFLICTED"], {
    truthState: "CONFLICTED",
    decisionEligible: false,
    nextBestMove: {
      move: "VERIFY_EVIDENCE",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-conflicted"],
      blockingConditions: ["CONFLICTED_EVIDENCE"],
      whatWouldChange: ["RESOLVED_CONFLICT"]
    }
  });

  const result = projectIonosIntelligentInboxV1(input([unknown, stale, conflicted]));
  assert.deepEqual(result.requiresVerification.map((item) => item.id), ["unknown", "stale-evidence", "conflicted"].sort());
  for (const item of result.requiresVerification) {
    assert.equal(item.decisionEligible, false);
    assert.equal(item.nextMove, "VERIFY_EVIDENCE");
    assert.match(item.whatHappened, /verification/i);
  }
  assert.ok(result.executiveAttention.every((item) => item.attentionReason === "VERIFY_EVIDENCE"));
});

test("high-value active asks outrank ordinary replies through explicit attention precedence", () => {
  const ordinary = projection({ projectionId: "ordinary" });
  const highAsk = projection({
    projectionId: "high-ask",
    states: ["NEEDS_REPLY", "HIGH_VALUE", "ACTIVE_ASK"],
    activeAskIds: ["ask-1"],
    lastMeaningfulInteraction: {
      activityId: "activity-high-ask",
      canonicalEmailId: "email-high-ask",
      effectiveTimestamp: "2026-09-07T17:00:00.000Z",
      direction: "INBOUND",
      mailboxRole: PERSONAL,
      expectsReply: true
    }
  });

  const result = projectIonosIntelligentInboxV1(input([ordinary, highAsk], { attentionBudget: 2 }));
  assert.deepEqual(result.executiveAttention.map((item) => item.id), ["high-ask", "ordinary"]);
  assert.equal(result.executiveAttention[0].attentionReason, "HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY");
});

test("stale high-value opportunities outrank ordinary follow-up suggestions", () => {
  const followUp = withStates("follow", "NO_ACTION", ["NO_ACTION", "FOLLOW_UP_SUGGESTED"], {
    nextBestMove: {
      move: "PREPARE_FOLLOW_UP",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-follow"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });
  const staleHigh = withStates("stale-high", "WAITING_ON_CONTACT", ["WAITING_ON_CONTACT", "STALE_OPPORTUNITY", "HIGH_VALUE"], {
    opportunityIds: ["opportunity-1"],
    lastMeaningfulInteraction: {
      activityId: "activity-stale-high",
      canonicalEmailId: "email-stale-high",
      effectiveTimestamp: "2026-07-01T17:00:00.000Z",
      direction: "OUTBOUND",
      mailboxRole: PERSONAL,
      expectsReply: true
    }
  });

  const result = projectIonosIntelligentInboxV1(input([followUp, staleHigh], { attentionBudget: 2 }));
  assert.deepEqual(result.executiveAttention.map((item) => item.id), ["stale-high", "follow"]);
});

test("attention budgets honor exact zero one and sufficient boundaries", () => {
  const items = [projection({ projectionId: "a" }), projection({ projectionId: "b" })];
  assert.equal(projectIonosIntelligentInboxV1(input(items, { attentionBudget: 0 })).executiveAttention.length, 0);
  assert.equal(projectIonosIntelligentInboxV1(input(items, { attentionBudget: 1 })).executiveAttention.length, 1);
  assert.equal(projectIonosIntelligentInboxV1(input(items, { attentionBudget: 2 })).executiveAttention.length, 2);
  assert.equal(projectIonosIntelligentInboxV1(input(items, { attentionBudget: 20 })).executiveAttention.length, 2);
});

test("queue limits honor exact boundaries without dropping verification evidence from the full result", () => {
  const unknownA = withStates("unknown-a", "UNKNOWN", ["UNKNOWN"], { truthState: "UNKNOWN", decisionEligible: false });
  const unknownB = withStates("unknown-b", "UNKNOWN", ["UNKNOWN"], { truthState: "UNKNOWN", decisionEligible: false });
  const needsA = projection({ projectionId: "needs-a" });
  const needsB = projection({ projectionId: "needs-b" });

  const zero = projectIonosIntelligentInboxV1(input([unknownA, unknownB, needsA, needsB], {
    queueLimits: { needsReply: 0 }
  }));
  assert.equal(zero.needsReply.length, 0);
  assert.equal(zero.requiresVerification.length, 2);

  const one = projectIonosIntelligentInboxV1(input([unknownA, unknownB, needsA, needsB], {
    queueLimits: { needsReply: 1 }
  }));
  assert.equal(one.needsReply.length, 1);
  assert.equal(one.requiresVerification.length, 2);
});

test("suggestions remain explicitly unverified and prepare-only", () => {
  const commitment = withStates("commit", "NO_ACTION", ["NO_ACTION", "COMMITMENT_SUGGESTED"], {
    commitmentSuggestionIds: ["commit-1"],
    nextBestMove: {
      move: "PREPARE_FOLLOW_UP",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-evidence-commit"],
      blockingConditions: ["VERIFY_COMMITMENT"],
      whatWouldChange: ["DIRECT_CONFIRMATION"]
    }
  });
  const result = projectIonosIntelligentInboxV1(input([commitment]));
  assert.equal(result.suggestedCommitments[0].nextMove, "PREPARE_FOLLOW_UP");
  assert.equal(result.suggestedCommitments[0].nextMoveStatus, "SUGGESTED_UNVERIFIED");
  assert.doesNotMatch(JSON.stringify(result), /SEND|SMTP|COMPOSE/i);
});

test("surfaced attention items retain what happened why next freshness and evidence fingerprint", () => {
  const result = projectIonosIntelligentInboxV1(input([projection({ projectionId: "detail" })], {
    deepLinks: { detail: "/relationships/detail" },
    attentionBudget: 1
  }));
  const item = result.executiveAttention[0];
  assert.ok(item.whatHappened.length > 0);
  assert.ok(item.whyItMatters.length > 0);
  assert.ok(item.nextMove.length > 0);
  assert.equal(item.freshnessState, "CURRENT");
  assert.equal(item.evidenceFingerprint, "fingerprint-detail");
  assert.equal(item.deepLink, "/relationships/detail");
});

test("input permutations and reruns produce stable ordering and telemetry", () => {
  const projections = [
    projection({ projectionId: "c", lastMeaningfulInteraction: null }),
    projection({ projectionId: "a", lastMeaningfulInteraction: null }),
    projection({ projectionId: "b", lastMeaningfulInteraction: null })
  ];
  const first = projectIonosIntelligentInboxV1(input(projections));
  const second = projectIonosIntelligentInboxV1(input([...projections].reverse()));
  assert.deepEqual(second, first);
  assert.deepEqual(first.needsReply.map((item) => item.id), ["a", "b", "c"]);
});

test("fails closed on unsafe links malformed budgets unknown keys duplicate ids fingerprints and contradictory states", () => {
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([projection()], { deepLinks: { "projection-1": "https://example.com" } })),
    /safe internal path/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([projection()], { deepLinks: { "projection-1": "javascript:alert(1)" } })),
    /safe internal path/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([projection()], { deepLinks: { "projection-1": "/relationships/../secret" } })),
    /safe internal path/i
  );
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(() => projectIonosIntelligentInboxV1(input([projection()], { attentionBudget: bad })), /non-negative integer/i);
  }
  assert.throws(
    () => projectIonosIntelligentInboxV1({ ...input([projection()]), secret: "no" } as unknown as IonosIntelligentInboxInputV1),
    /unsupported key/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([projection({ projectionId: "dup" }), projection({ projectionId: "dup" })])),
    /duplicate projection ids/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      projection({ projectionId: "one", evidenceFingerprint: "same" }),
      projection({ projectionId: "two", evidenceFingerprint: "same" })
    ])),
    /duplicate evidence fingerprints/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      projection({ projectionId: "contradiction", primaryState: "NEEDS_REPLY", states: ["NO_ACTION"] })
    ])),
    /primaryState must appear in states/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      { ...projection({ projectionId: "extra" }), secret: "no" } as unknown as RelationshipStateProjectionV1
    ])),
    /unsupported key/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([projection()], { queueLimits: { needsReply: -1 } })),
    /non-negative integer/i
  );
});

test("rejects malformed timestamps unsupported enums and inconsistent uncertain decision eligibility", () => {
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      projection({
        projectionId: "future",
        lastMeaningfulInteraction: {
          activityId: "activity-future",
          canonicalEmailId: "email-future",
          effectiveTimestamp: "2026-09-09T18:10:00.000Z",
          direction: "INBOUND",
          mailboxRole: PERSONAL,
          expectsReply: true
        }
      })
    ])),
    /future-dated/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      { ...projection({ projectionId: "bad-state" }), primaryState: "MAYBE" } as unknown as RelationshipStateProjectionV1
    ])),
    /unsupported primaryState/i
  );
  assert.throws(
    () => projectIonosIntelligentInboxV1(input([
      projection({ projectionId: "uncertain", truthState: "UNKNOWN", decisionEligible: true })
    ])),
    /cannot be decisionEligible/i
  );
});

test("telemetry omits private relationship evidence and raw content", () => {
  const item = projection({
    projectionId: "privacy",
    evidenceRefs: ["private-evidence-never-emit"],
    nextBestMove: {
      move: "PREPARE_REPLY",
      status: "SUGGESTED_UNVERIFIED",
      evidenceRefs: ["private-next-evidence-never-emit"],
      blockingConditions: [],
      whatWouldChange: []
    }
  });
  const result = projectIonosIntelligentInboxV1(input([item]));
  const telemetry = JSON.stringify(result.telemetry);
  assert.doesNotMatch(telemetry, /private-evidence|private-next-evidence/i);
  assert.doesNotMatch(telemetry, /subject|body|attachment|credential|secret|@/i);
  assert.match(telemetry, /fingerprint-privacy/);
});

test("runtime module exports only the pure projection capability", () => {
  assert.deepEqual(Object.keys(inboxModule).sort(), ["projectIonosIntelligentInboxV1"]);
  const source = JSON.stringify(Object.keys(inboxModule));
  assert.doesNotMatch(source, /send|smtp|mutat|persist|network|scheduler|model|automatic/i);
});

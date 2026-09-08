import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalEmailCrmLinkResultV1,
  EmailActivityProjectionV1
} from "@/lib/email/ionos-crm-linking-v1";
import {
  projectIonosRelationshipStateV1,
  type IonosRelationshipStateInputV1,
  type RelationshipActivityClassificationEvidenceV1
} from "@/lib/email/ionos-relationship-state-v1";
import * as relationshipStateModule from "@/lib/email/ionos-relationship-state-v1";

const NOW = "2026-09-08T18:00:00.000Z";
const ROLE_A = "PERSONAL_HIGH_VALUE_RELATIONSHIP" as const;
const ROLE_B = "ASSISTANT_CUSTOMER_SERVICE_OUTREACH" as const;
const ROLE_C = "MARKETING_FUNNELKIT" as const;

function activity(
  id: string,
  effectiveTimestamp: string,
  overrides: Partial<EmailActivityProjectionV1> = {}
): EmailActivityProjectionV1 {
  return {
    id,
    canonicalEmailId: `email-${id}`,
    contactId: "contact-1",
    companyId: null,
    linkedEntities: [],
    sourceTimestamp: effectiveTimestamp,
    effectiveTimestamp,
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    evidenceRefs: [`crm-evidence-${id}`],
    provenanceFingerprints: [`provenance-${id}`],
    supersedesCanonicalEmailId: null,
    ...overrides
  };
}

function crm(activities: readonly EmailActivityProjectionV1[]): CanonicalEmailCrmLinkResultV1 {
  return {
    records: activities.map((item) => ({
      canonicalEmailId: item.canonicalEmailId,
      participantResolutions: [],
      linkedEntities: item.linkedEntities,
      sourceTimestamp: item.sourceTimestamp,
      effectiveTimestamp: item.effectiveTimestamp,
      truthState: item.truthState,
      freshnessState: item.freshnessState,
      evidenceRefs: item.evidenceRefs,
      provenanceFingerprints: item.provenanceFingerprints,
      supersedesCanonicalEmailId: item.supersedesCanonicalEmailId,
      decisionEligible: item.truthState === "KNOWN" && item.freshnessState === "CURRENT"
    })),
    activities: [...activities],
    contactTimelines: [],
    telemetry: {
      recordCount: activities.length,
      activityCount: activities.length,
      resolvedContactCount: new Set(activities.map((item) => item.contactId)).size,
      unknownParticipantCount: 0,
      ambiguousParticipantCount: 0,
      conflictedCompanyCount: 0,
      linkedEntityCount: activities.reduce((count, item) => count + item.linkedEntities.length, 0),
      correctionCount: 0,
      recordFingerprints: activities.map((item) => `record-${item.id}`).sort()
    }
  };
}

function classification(
  item: EmailActivityProjectionV1,
  overrides: Partial<RelationshipActivityClassificationEvidenceV1> = {}
): RelationshipActivityClassificationEvidenceV1 {
  return {
    activityId: item.id,
    canonicalEmailId: item.canonicalEmailId,
    contactId: item.contactId,
    threadId: "thread-1",
    direction: "INBOUND",
    classification: "DIRECT_HUMAN",
    mailboxRole: ROLE_A,
    expectsReply: true,
    evidenceRef: `classification-${item.id}`,
    observedAt: item.effectiveTimestamp,
    ...overrides
  };
}

function input(
  activities: readonly EmailActivityProjectionV1[],
  classifications: readonly RelationshipActivityClassificationEvidenceV1[],
  overrides: Partial<IonosRelationshipStateInputV1> = {}
): IonosRelationshipStateInputV1 {
  return {
    crm: crm(activities),
    activityClassifications: classifications,
    staleThreadDays: 7,
    staleOpportunityDays: 14,
    now: NOW,
    ...overrides
  };
}

test("a direct reply closes NEEDS_REPLY without inventing a new waiting state", () => {
  const inbound = activity("inbound", "2026-09-07T10:00:00.000Z");
  const reply = activity("reply", "2026-09-07T11:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [inbound, reply],
    [
      classification(inbound, { direction: "INBOUND", expectsReply: true }),
      classification(reply, { direction: "OUTBOUND", expectsReply: false })
    ]
  ));

  assert.equal(result.projections[0].primaryState, "NO_ACTION");
  assert.deepEqual(result.projections[0].states, ["NO_ACTION"]);
  assert.equal(result.projections[0].lastMeaningfulInteraction?.activityId, "reply");
});

test("unanswered direct inbound becomes NEEDS_REPLY with evidence and a prepare-only next move", () => {
  const inbound = activity("needs-reply", "2026-09-08T10:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [inbound],
    [classification(inbound, { direction: "INBOUND", expectsReply: true })]
  ));

  const projection = result.projections[0];
  assert.equal(projection.primaryState, "NEEDS_REPLY");
  assert.ok(projection.states.includes("NEEDS_REPLY"));
  assert.equal(projection.nextBestMove.move, "PREPARE_REPLY");
  assert.equal(projection.nextBestMove.status, "SUGGESTED_UNVERIFIED");
  assert.ok(projection.nextBestMove.blockingConditions.includes("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL"));
  assert.ok(projection.nextBestMove.evidenceRefs.includes("classification-needs-reply"));
});

test("unanswered direct outbound becomes WAITING_ON_CONTACT", () => {
  const outbound = activity("waiting", "2026-09-08T12:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [outbound],
    [classification(outbound, { direction: "OUTBOUND", expectsReply: true })]
  ));

  assert.equal(result.projections[0].primaryState, "WAITING_ON_CONTACT");
  assert.equal(result.projections[0].nextBestMove.move, "WAIT_FOR_CONTACT");
});

test("stale direct thread and explicit active opportunity remain distinct states", () => {
  const outbound = activity("old-outbound", "2026-08-20T18:00:00.000Z", {
    linkedEntities: [{ entityType: "OPPORTUNITY", entityId: "opp-1", evidenceRefs: ["opportunity-link"] }]
  });
  const result = projectIonosRelationshipStateV1(input(
    [outbound],
    [classification(outbound, { direction: "OUTBOUND", expectsReply: true })],
    {
      opportunities: [{
        opportunityId: "opp-1",
        contactId: "contact-1",
        active: true,
        truthState: "KNOWN",
        freshnessState: "CURRENT",
        evidenceRef: "active-opportunity-evidence",
        observedAt: "2026-09-08T09:00:00.000Z"
      }]
    }
  ));

  const states = result.projections[0].states;
  assert.ok(states.includes("STALE_THREAD"));
  assert.ok(states.includes("STALE_OPPORTUNITY"));
  assert.ok(states.includes("FOLLOW_UP_SUGGESTED"));
  assert.equal(result.projections[0].nextBestMove.move, "PREPARE_FOLLOW_UP");
});

test("marketing and automated events cannot satisfy or clear direct-reply state", () => {
  const inbound = activity("direct-in", "2026-09-08T10:00:00.000Z");
  const marketing = activity("marketing", "2026-09-08T11:00:00.000Z");
  const opened = activity("open", "2026-09-08T12:00:00.000Z");
  const delivery = activity("delivery", "2026-09-08T13:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [inbound, marketing, opened, delivery],
    [
      classification(inbound, { direction: "INBOUND", expectsReply: true }),
      classification(marketing, {
        direction: "OUTBOUND",
        classification: "MARKETING_SEND",
        mailboxRole: ROLE_C,
        expectsReply: false
      }),
      classification(opened, {
        direction: "INBOUND",
        classification: "MARKETING_OPEN",
        mailboxRole: ROLE_C,
        expectsReply: false
      }),
      classification(delivery, {
        direction: "SELF",
        classification: "DELIVERY",
        mailboxRole: ROLE_C,
        expectsReply: false
      })
    ]
  ));

  assert.equal(result.projections[0].primaryState, "NEEDS_REPLY");
  assert.equal(result.projections[0].lastMeaningfulInteraction?.activityId, "direct-in");
});

test("non-direct notification, bounce, delivery, and self evidence never creates personal reply state", () => {
  const notification = activity("notice", "2026-09-08T10:00:00.000Z");
  const bounce = activity("bounce", "2026-09-08T11:00:00.000Z");
  const delivery = activity("delivered", "2026-09-08T12:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [notification, bounce, delivery],
    [
      classification(notification, { direction: "INBOUND", classification: "AUTOMATED_NOTIFICATION", expectsReply: false }),
      classification(bounce, { direction: "INBOUND", classification: "BOUNCE", expectsReply: false }),
      classification(delivery, { direction: "SELF", classification: "DELIVERY", expectsReply: false })
    ]
  ));

  assert.equal(result.projections[0].primaryState, "NO_ACTION");
  assert.equal(result.projections[0].lastMeaningfulInteraction, null);
});

test("HIGH_VALUE, ACTIVE_ASK, and commitment state require explicit governed evidence", () => {
  const outbound = activity("ask", "2026-09-01T18:00:00.000Z", {
    linkedEntities: [{ entityType: "OPPORTUNITY", entityId: "opp-1", evidenceRefs: ["opp-link"] }]
  });
  const result = projectIonosRelationshipStateV1(input(
    [outbound],
    [classification(outbound, { direction: "OUTBOUND", expectsReply: true })],
    {
      staleThreadDays: 7,
      values: [{
        scopeType: "CONTACT",
        scopeId: "contact-1",
        classification: "HIGH_VALUE",
        truthState: "KNOWN",
        freshnessState: "CURRENT",
        evidenceRef: "governed-value",
        observedAt: "2026-09-08T08:00:00.000Z"
      }],
      activeAsks: [{
        askId: "ask-1",
        activityId: "ask",
        threadId: "thread-1",
        contactId: "contact-1",
        opportunityId: "opp-1",
        truthState: "KNOWN",
        freshnessState: "CURRENT",
        evidenceRef: "ask-evidence",
        observedAt: "2026-09-08T08:30:00.000Z"
      }],
      commitmentSuggestions: [{
        commitmentId: "commitment-1",
        activityId: "ask",
        threadId: "thread-1",
        contactId: "contact-1",
        status: "SUGGESTED_UNVERIFIED",
        evidenceRef: "commitment-evidence",
        observedAt: "2026-09-08T08:45:00.000Z"
      }]
    }
  ));

  const projection = result.projections[0];
  assert.ok(projection.states.includes("HIGH_VALUE"));
  assert.ok(projection.states.includes("ACTIVE_ASK"));
  assert.ok(projection.states.includes("COMMITMENT_SUGGESTED"));
  assert.deepEqual(projection.activeAskIds, ["ask-1"]);
  assert.deepEqual(projection.commitmentSuggestionIds, ["commitment-1"]);
});

test("new direct reply revises state while retaining prior projection lineage", () => {
  const inbound = activity("first", "2026-09-08T10:00:00.000Z");
  const first = projectIonosRelationshipStateV1(input(
    [inbound],
    [classification(inbound, { direction: "INBOUND", expectsReply: true })]
  ));
  const previous = first.projections[0];
  const reply = activity("later-reply", "2026-09-08T11:00:00.000Z");
  const second = projectIonosRelationshipStateV1(input(
    [inbound, reply],
    [
      classification(inbound, { direction: "INBOUND", expectsReply: true }),
      classification(reply, { direction: "OUTBOUND", expectsReply: false })
    ],
    {
      priorProjections: [{
        projectionId: previous.projectionId,
        threadId: previous.threadId,
        generatedAt: first.generatedAt,
        evidenceFingerprint: previous.evidenceFingerprint,
        states: previous.states
      }]
    }
  ));

  assert.equal(second.projections[0].primaryState, "NO_ACTION");
  assert.equal(second.projections[0].supersedesProjectionId, previous.projectionId);
  assert.deepEqual(second.projections[0].priorState?.states, ["NEEDS_REPLY"]);
});

test("same resolved contact unifies direct evidence across mailbox roles without collapsing events", () => {
  const first = activity("role-a", "2026-09-08T10:00:00.000Z");
  const second = activity("role-b", "2026-09-08T11:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [first, second],
    [
      classification(first, { direction: "OUTBOUND", expectsReply: true, mailboxRole: ROLE_A }),
      classification(second, { direction: "INBOUND", expectsReply: false, mailboxRole: ROLE_B })
    ]
  ));

  assert.equal(result.projections.length, 1);
  assert.deepEqual(result.projections[0].mailboxRoles, [ROLE_B, ROLE_A].sort());
  assert.equal(result.projections[0].lastMeaningfulInteraction?.activityId, "role-b");
  assert.equal(result.projections[0].primaryState, "NO_ACTION");
});

test("unrelated thread evidence cannot clear another thread state", () => {
  const threadA = activity("thread-a-in", "2026-09-08T10:00:00.000Z");
  const threadB = activity("thread-b-out", "2026-09-08T11:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [threadA, threadB],
    [
      classification(threadA, { threadId: "thread-a", direction: "INBOUND", expectsReply: true }),
      classification(threadB, { threadId: "thread-b", direction: "OUTBOUND", expectsReply: false })
    ]
  ));

  const a = result.projections.find((projection) => projection.threadId === "thread-a");
  const b = result.projections.find((projection) => projection.threadId === "thread-b");
  assert.equal(a?.primaryState, "NEEDS_REPLY");
  assert.equal(b?.primaryState, "NO_ACTION");
});

test("conflicted or stale required evidence fails decision eligibility closed", () => {
  const conflicted = activity("conflicted", "2026-09-08T10:00:00.000Z", { truthState: "CONFLICTED" });
  const stale = activity("stale", "2026-09-08T11:00:00.000Z", { freshnessState: "STALE" });

  const conflictResult = projectIonosRelationshipStateV1(input(
    [conflicted],
    [classification(conflicted)]
  ));
  assert.equal(conflictResult.projections[0].primaryState, "CONFLICTED");
  assert.equal(conflictResult.projections[0].truthState, "CONFLICTED");
  assert.equal(conflictResult.projections[0].decisionEligible, false);
  assert.equal(conflictResult.projections[0].nextBestMove.move, "VERIFY_EVIDENCE");

  const staleResult = projectIonosRelationshipStateV1(input(
    [stale],
    [classification(stale)]
  ));
  assert.equal(staleResult.projections[0].primaryState, "UNKNOWN");
  assert.equal(staleResult.projections[0].freshnessState, "STALE");
  assert.equal(staleResult.projections[0].decisionEligible, false);
});

test("explicit resolution suppresses action only when current KNOWN evidence follows the interaction", () => {
  const inbound = activity("resolved-thread", "2026-09-08T10:00:00.000Z");
  const base = input([inbound], [classification(inbound)], {
    resolutions: [{
      threadId: "thread-1",
      contactId: "contact-1",
      resolvedAt: "2026-09-08T11:00:00.000Z",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      evidenceRef: "resolution-proof",
      observedAt: "2026-09-08T11:00:00.000Z"
    }]
  });
  const result = projectIonosRelationshipStateV1(base);
  assert.equal(result.projections[0].primaryState, "RESOLVED");
  assert.equal(result.projections[0].nextBestMove.move, "NO_ACTION");

  const uncertain = projectIonosRelationshipStateV1({
    ...base,
    resolutions: [{
      ...base.resolutions![0],
      truthState: "UNKNOWN"
    }]
  });
  assert.equal(uncertain.projections[0].primaryState, "UNKNOWN");
  assert.equal(uncertain.projections[0].decisionEligible, false);
});

test("staleness threshold is deterministic at the exact configured boundary", () => {
  const exact = activity("exact", "2026-09-01T18:00:00.000Z");
  const before = activity("before", "2026-09-01T18:00:00.001Z");

  const exactResult = projectIonosRelationshipStateV1(input(
    [exact],
    [classification(exact, { direction: "OUTBOUND", expectsReply: true })]
  ));
  assert.ok(exactResult.projections[0].states.includes("STALE_THREAD"));

  const beforeResult = projectIonosRelationshipStateV1(input(
    [before],
    [classification(before, { direction: "OUTBOUND", expectsReply: true })]
  ));
  assert.equal(beforeResult.projections[0].states.includes("STALE_THREAD"), false);
});

test("permuting activities and evidence produces the same deterministic projection", () => {
  const a = activity("a", "2026-09-07T10:00:00.000Z", {
    linkedEntities: [{ entityType: "OPPORTUNITY", entityId: "opp-1", evidenceRefs: ["opp-link"] }]
  });
  const b = activity("b", "2026-09-07T11:00:00.000Z");
  const classifications = [
    classification(a, { direction: "OUTBOUND", expectsReply: true }),
    classification(b, { direction: "INBOUND", expectsReply: false })
  ];
  const overrides: Partial<IonosRelationshipStateInputV1> = {
    opportunities: [{
      opportunityId: "opp-1",
      contactId: "contact-1",
      active: true,
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      evidenceRef: "opp-state",
      observedAt: "2026-09-08T08:00:00.000Z"
    }],
    values: [{
      scopeType: "OPPORTUNITY",
      scopeId: "opp-1",
      classification: "HIGH_VALUE",
      truthState: "KNOWN",
      freshnessState: "CURRENT",
      evidenceRef: "high-value",
      observedAt: "2026-09-08T08:30:00.000Z"
    }]
  };

  const first = projectIonosRelationshipStateV1(input([a, b], classifications, overrides));
  const second = projectIonosRelationshipStateV1(input(
    [b, a],
    [...classifications].reverse(),
    {
      ...overrides,
      opportunities: [...overrides.opportunities!].reverse(),
      values: [...overrides.values!].reverse()
    }
  ));
  assert.deepEqual(second, first);
});

test("malformed, duplicate, future, unsupported, and contradictory evidence fails closed", () => {
  const item = activity("bad", "2026-09-08T10:00:00.000Z");

  assert.throws(
    () => projectIonosRelationshipStateV1(input([item], [])),
    /every CRM activity requires exactly one explicit activity classification/i
  );
  assert.throws(
    () => projectIonosRelationshipStateV1(input(
      [item],
      [classification(item), classification(item)]
    )),
    /duplicate activity classification/i
  );
  assert.throws(
    () => projectIonosRelationshipStateV1(input(
      [item],
      [classification(item, { observedAt: "2026-09-09T00:00:00.000Z" })]
    )),
    /future-dated/i
  );
  assert.throws(
    () => projectIonosRelationshipStateV1(input(
      [item],
      [{ ...classification(item), secretExtra: "reject" } as unknown as RelationshipActivityClassificationEvidenceV1]
    )),
    /unsupported key/i
  );
  assert.throws(
    () => projectIonosRelationshipStateV1(input(
      [item],
      [classification(item, { direction: "SELF", classification: "DIRECT_HUMAN" })]
    )),
    /cannot be SELF/i
  );
  assert.throws(
    () => projectIonosRelationshipStateV1({
      ...input([item], [classification(item)]),
      staleThreadDays: Number.NaN
    }),
    /non-negative finite integer/i
  );
});

test("simultaneous contradictory direct sequence is CONFLICTED rather than tie-broken", () => {
  const inbound = activity("same-in", "2026-09-08T10:00:00.000Z");
  const outbound = activity("same-out", "2026-09-08T10:00:00.000Z");
  const result = projectIonosRelationshipStateV1(input(
    [inbound, outbound],
    [
      classification(inbound, { direction: "INBOUND", expectsReply: true }),
      classification(outbound, { direction: "OUTBOUND", expectsReply: true })
    ]
  ));

  assert.equal(result.projections[0].primaryState, "CONFLICTED");
  assert.equal(result.projections[0].decisionEligible, false);
  assert.ok(result.projections[0].nextBestMove.blockingConditions.includes("CONTRADICTORY_DIRECT_SEQUENCE"));
});

test("telemetry contains counts and fingerprints only, not evidence refs or private content", () => {
  const item = activity("private", "2026-09-08T10:00:00.000Z", {
    evidenceRefs: ["PRIVATE-EVIDENCE-SENTINEL"]
  });
  const result = projectIonosRelationshipStateV1(input(
    [item],
    [classification(item, { evidenceRef: "PRIVATE-CLASSIFICATION-SENTINEL" })]
  ));
  const telemetry = JSON.stringify(result.telemetry);

  assert.equal(telemetry.includes("PRIVATE-EVIDENCE-SENTINEL"), false);
  assert.equal(telemetry.includes("PRIVATE-CLASSIFICATION-SENTINEL"), false);
  assert.equal(telemetry.includes("@"), false);
  assert.equal(result.telemetry.projectionCount, 1);
  assert.equal(result.telemetry.projectionFingerprints.length, 1);
});

test("runtime exports expose projection only and no send, mailbox mutation, persistence, scheduler, network, or model capability", () => {
  assert.deepEqual(Object.keys(relationshipStateModule).sort(), ["projectIonosRelationshipStateV1"]);
  const exportsText = Object.keys(relationshipStateModule).join(" ").toLowerCase();
  for (const forbidden of ["send", "smtp", "delete", "move", "store", "persist", "schedule", "fetch", "model", "mergecontact"]) {
    assert.equal(exportsText.includes(forbidden), false, `unexpected capability export containing ${forbidden}`);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import * as pipelineModule from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";
import {
  projectIonosReadonlyIntelligencePipelineV1,
  type IonosReadonlyIntelligencePipelineInputV1
} from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";
import { normalizeHistoricalEmailMessagesV1 } from "@/lib/email/ionos-email-normalization-v1";
import type { CanonicalEmailCrmLinkResultV1 } from "@/lib/email/ionos-crm-linking-v1";
import type {
  HistoricalEmailEnvelopeV1
} from "@/lib/email/ionos-email-normalization-v1";

const NOW = "2026-09-08T18:00:00.000Z";

function message(overrides: Partial<HistoricalEmailEnvelopeV1> = {}): HistoricalEmailEnvelopeV1 {
  return {
    mailboxId: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    folder: "INBOX",
    uidValidity: "77",
    uid: "100",
    messageId: "<collector-inquiry@example.test>",
    direction: "INBOUND",
    participants: {
      from: ["collector@example.test"],
      to: ["keegan@example.test"],
      cc: [],
      bcc: []
    },
    sentAt: "2026-09-08T12:00:00.000Z",
    receivedAt: "2026-09-08T12:00:05.000Z",
    subject: "Private collector inquiry",
    inReplyTo: null,
    references: [],
    body: { policy: "TEXT", text: "private message body" },
    attachments: [],
    sourceTimestamp: "2026-09-08T12:00:06.000Z",
    ...overrides
  };
}

function classifications(crm: CanonicalEmailCrmLinkResultV1) {
  return crm.activities.map((activity) => ({
    activityId: activity.id,
    canonicalEmailId: activity.canonicalEmailId,
    contactId: activity.contactId,
    threadId: "thread-collector",
    direction: "INBOUND" as const,
    classification: "DIRECT_HUMAN" as const,
    mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP" as const,
    expectsReply: true,
    evidenceRef: `classification:${activity.id}`,
    observedAt: activity.effectiveTimestamp
  }));
}

function input(
  overrides: Partial<IonosReadonlyIntelligencePipelineInputV1> = {}
): IonosReadonlyIntelligencePipelineInputV1 {
  return {
    messages: [message()],
    horizon: {
      startAt: "2026-09-01T00:00:00.000Z",
      endAt: NOW
    },
    batchSize: 100,
    crm: {
      contacts: [{
        contactId: "contact-collector",
        email: "collector@example.test",
        evidenceRef: "crm-contact-evidence",
        observedAt: "2026-09-08T13:00:00.000Z"
      }],
      companyDomains: [],
      entityLinks: [],
      recordStates: [],
      corrections: [],
      now: NOW
    },
    classifyActivities: classifications,
    relationship: {
      staleThreadDays: 7,
      staleOpportunityDays: 14,
      now: NOW
    },
    inbox: {
      attentionBudget: 10,
      deepLinks: {}
    },
    ...overrides
  };
}

test("known direct inbound correspondence flows through every canonical stage into attention", () => {
  const result = projectIonosReadonlyIntelligencePipelineV1(input());

  assert.equal(result.normalization.records.length, 1);
  assert.equal(result.crm.activities.length, 1);
  assert.equal(result.relationship.projections.length, 1);
  assert.equal(result.relationship.projections[0].primaryState, "NEEDS_REPLY");
  assert.equal(result.inbox.needsReply.length, 1);
  assert.equal(result.inbox.executiveAttention.length, 1);
  assert.equal(result.inbox.executiveAttention[0].attentionReason, "NEEDS_REPLY");
  assert.equal(result.inbox.executiveAttention[0].nextMoveStatus, "SUGGESTED_UNVERIFIED");
  assert.ok(result.inbox.executiveAttention[0].blockingConditions.includes("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL"));
});

test("duplicate source copies normalize once and never duplicate downstream activity", () => {
  const duplicate = message({
    mailboxId: "assistant",
    role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    uidValidity: "88",
    uid: "200",
    sourceTimestamp: "2026-09-08T12:00:07.000Z"
  });
  const result = projectIonosReadonlyIntelligencePipelineV1(input({
    messages: [message(), duplicate]
  }));

  assert.equal(result.normalization.records.length, 1);
  assert.equal(result.normalization.records[0].provenance.length, 2);
  assert.equal(result.crm.activities.length, 1);
  assert.equal(result.relationship.projections.length, 1);
  assert.equal(result.inbox.needsReply.length, 1);
});

test("unresolved identity is explicitly gated for verification without fabricated CRM activity", () => {
  const result = projectIonosReadonlyIntelligencePipelineV1(input({
    crm: {
      contacts: [],
      companyDomains: [],
      entityLinks: [],
      recordStates: [],
      corrections: [],
      now: NOW
    }
  }));

  assert.equal(result.crm.records.length, 1);
  assert.equal(result.crm.records[0].decisionEligible, false);
  assert.equal(result.crm.activities.length, 0);
  assert.equal(result.verificationRequired.canonicalEmailIds.length, 1);
  assert.equal(result.telemetry.verificationRequiredCount, 1);
  assert.equal(result.inbox.executiveAttention.length, 0);
});

test("UNKNOWN STALE and CONFLICTED evidence cannot become actionable", () => {
  const normalized = normalizeHistoricalEmailMessagesV1({
    messages: [message()],
    horizon: { startAt: "2026-09-01T00:00:00.000Z", endAt: NOW },
    batchSize: 100
  });
  const canonicalEmailId = normalized.records[0].id;
  const cases = [
    { truthState: "UNKNOWN", freshnessState: "UNKNOWN" },
    { truthState: "KNOWN", freshnessState: "STALE" },
    { truthState: "CONFLICTED", freshnessState: "UNKNOWN" }
  ] as const;

  for (const state of cases) {
    const result = projectIonosReadonlyIntelligencePipelineV1(input({
      crm: {
        ...input().crm,
        recordStates: [{
          canonicalEmailId,
          ...state,
          evidenceRef: `state:${state.truthState}:${state.freshnessState}`,
          observedAt: "2026-09-08T13:30:00.000Z"
        }]
      }
    }));
    assert.ok(result.crm.records.every((record) => !record.decisionEligible));
    assert.ok(result.relationship.projections.every((projection) => !projection.decisionEligible));
    assert.ok(result.inbox.executiveAttention.every((item) => item.attentionReason === "VERIFY_EVIDENCE"));
    assert.ok(result.inbox.requiresVerification.every((item) => !item.decisionEligible));
  }
});

test("aggregate telemetry is deterministic and contains no correspondence or secret material", () => {
  const first = projectIonosReadonlyIntelligencePipelineV1(input());
  const second = projectIonosReadonlyIntelligencePipelineV1(input());
  assert.deepEqual(second, first);

  const telemetry = JSON.stringify(first.telemetry);
  assert.deepEqual(first.telemetry, {
    consideredCount: 1,
    canonicalRecordCount: 1,
    rejectionCount: 0,
    crmActivityCount: 1,
    relationshipProjectionCount: 1,
    inboxAttentionCount: 1,
    verificationRequiredCount: 0
  });
  assert.doesNotMatch(telemetry, /private|collector@|keegan@|subject|body|password|secret|op:\/\//i);
});

test("malformed top-level input classifier output and stage input fail closed", () => {
  assert.throws(
    () => projectIonosReadonlyIntelligencePipelineV1({ ...input(), secret: "no" } as unknown as IonosReadonlyIntelligencePipelineInputV1),
    /unsupported key secret/i
  );
  assert.throws(
    () => projectIonosReadonlyIntelligencePipelineV1({ ...input(), messages: {} } as unknown as IonosReadonlyIntelligencePipelineInputV1),
    /messages must be an array/i
  );
  assert.throws(
    () => projectIonosReadonlyIntelligencePipelineV1({ ...input(), classifyActivities: () => null } as unknown as IonosReadonlyIntelligencePipelineInputV1),
    /must return an array/i
  );
  assert.throws(
    () => projectIonosReadonlyIntelligencePipelineV1({ ...input(), batchSize: 0 }),
    /batchSize/i
  );
});

test("runtime export is one pure projection with no send scheduler persistence network or credential surface", () => {
  assert.deepEqual(Object.keys(pipelineModule), ["projectIonosReadonlyIntelligencePipelineV1"]);
  assert.doesNotMatch(
    JSON.stringify(Object.keys(pipelineModule)),
    /send|smtp|scheduler|persist|network|credential|secret|automatic/i
  );
});

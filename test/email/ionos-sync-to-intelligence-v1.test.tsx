import assert from "node:assert/strict";
import test from "node:test";

import * as compositionModule from "@/lib/email/ionos-sync-to-intelligence-v1";
import {
  projectCommittedIonosSyncToIntelligenceV1,
  type IonosSyncToIntelligenceInputV1
} from "@/lib/email/ionos-sync-to-intelligence-v1";
import type { HistoricalEmailEnvelopeV1 } from "@/lib/email/ionos-email-normalization-v1";
import { normalizeHistoricalEmailMessagesV1 } from "@/lib/email/ionos-email-normalization-v1";
import type { CanonicalEmailCrmLinkResultV1 } from "@/lib/email/ionos-crm-linking-v1";
import type {
  EmailIngestCandidateV1,
  EmailMailboxSyncResultV1
} from "@/lib/email/ionos-incremental-sync-v1";
import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";
import type {
  IonosReadonlyIntelligencePipelineInputV1,
  IonosReadonlyIntelligencePipelineResultV1
} from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";

const NOW_MS = Date.parse("2026-09-08T18:00:00.000Z");
const DEADLINE = NOW_MS + 10_000;
const NOW = new Date(NOW_MS).toISOString();

const MAILBOXES: readonly IonosMailboxRuntimeV1[] = [
  {
    id: "personal",
    role: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    user: "keegan@example.test",
    pass: "personal-secret",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    smtpEnabled: false
  },
  {
    id: "assistant",
    role: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    user: "assistant@example.test",
    pass: "assistant-secret",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    smtpEnabled: false
  },
  {
    id: "marketing",
    role: "MARKETING_FUNNELKIT",
    user: "marketing@example.test",
    pass: "marketing-secret",
    host: "imap.ionos.com",
    port: 993,
    folder: "INBOX",
    minVersion: "TLSv1.2",
    smtpEnabled: false
  }
];

function candidate(
  mailbox: IonosMailboxRuntimeV1,
  uid = "100"
): EmailIngestCandidateV1 {
  return {
    id: `${mailbox.id}:${uid}`,
    mailboxId: mailbox.id,
    role: mailbox.role,
    uidValidity: "77",
    uid,
    messageId: `<${mailbox.id}-${uid}@example.test>`,
    internalDate: "2026-09-08T12:00:05.000Z",
    size: 512
  };
}

function syncResult(
  mailbox: IonosMailboxRuntimeV1,
  candidates: readonly EmailIngestCandidateV1[] = [],
  status: EmailMailboxSyncResultV1["status"] = candidates.length ? "SYNCED" : "NO_NEW_MAIL"
): EmailMailboxSyncResultV1 {
  return {
    mailboxId: mailbox.id,
    role: mailbox.role,
    status,
    reason: candidates.length ? "NEW_MESSAGES_COMMITTED" : "NO_NEW_MESSAGES",
    fetchedCount: candidates.length,
    candidateCount: candidates.length,
    retryCount: 0,
    cursorFingerprint: "cursor-fingerprint",
    candidates
  };
}

function envelope(overrides: Partial<HistoricalEmailEnvelopeV1> = {}): HistoricalEmailEnvelopeV1 {
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
    body: { policy: "NONE" },
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

function pipelineInput(
  message = envelope(),
  truthState: "KNOWN" | "UNKNOWN" = "KNOWN"
): Omit<IonosReadonlyIntelligencePipelineInputV1, "messages"> {
  const canonicalEmailId = normalizeHistoricalEmailMessagesV1({
    messages: [message],
    horizon: { startAt: "2026-09-01T00:00:00.000Z", endAt: NOW },
    batchSize: 100
  }).records[0].id;

  return {
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
      recordStates: [{
        canonicalEmailId,
        truthState,
        freshnessState: truthState === "KNOWN" ? "CURRENT" : "UNKNOWN",
        evidenceRef: `state:${truthState}`,
        observedAt: "2026-09-08T13:30:00.000Z"
      }],
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
    }
  };
}

function input(
  results: readonly EmailMailboxSyncResultV1[],
  pipeline = pipelineInput()
): IonosSyncToIntelligenceInputV1 {
  return {
    mailboxes: MAILBOXES,
    syncResults: results,
    evidenceBatchSize: 20,
    deadlineAtMs: DEADLINE,
    pipeline
  };
}

function emptyPipelineResult(): IonosReadonlyIntelligencePipelineResultV1 {
  return {
    normalization: { records: [], rejections: [], consideredCount: 0 },
    crm: { records: [], activities: [], telemetry: { recordCount: 0, activityCount: 0, unresolvedIdentityCount: 0, verificationRequiredCount: 0 } },
    relationship: { projections: [], telemetry: { projectionCount: 0, needsReplyCount: 0, waitingOnThemCount: 0, waitingOnUsCount: 0, verifyEvidenceCount: 0 } },
    inbox: { needsReply: [], followUpDue: [], staleOpportunities: [], requiresVerification: [], executiveAttention: [], telemetry: { needsReplyCount: 0, followUpDueCount: 0, staleOpportunityCount: 0, requiresVerificationCount: 0, executiveAttentionCount: 0 } },
    verificationRequired: { canonicalEmailIds: [], relationshipProjectionIds: [] },
    telemetry: {
      consideredCount: 0,
      canonicalRecordCount: 0,
      rejectionCount: 0,
      crmActivityCount: 0,
      relationshipProjectionCount: 0,
      inboxAttentionCount: 0,
      verificationRequiredCount: 0
    }
  } as unknown as IonosReadonlyIntelligencePipelineResultV1;
}

test("matches all three mailboxes deterministically and sends exact committed UIDs through evidence once", async () => {
  const personalCandidates = [candidate(MAILBOXES[0], "102"), candidate(MAILBOXES[0], "101")];
  const results = [
    syncResult(MAILBOXES[2]),
    syncResult(MAILBOXES[0], personalCandidates),
    syncResult(MAILBOXES[1])
  ];
  const evidenceCalls: Array<{ mailboxId: string; uids: string[]; deadlineAtMs: number; batchSize: number }> = [];
  let pipelineCalls = 0;
  let projectedMessages: readonly HistoricalEmailEnvelopeV1[] = [];

  const result = await projectCommittedIonosSyncToIntelligenceV1(input(results), {
    now: () => NOW_MS,
    fetchEvidence: async ({ mailbox, candidates, deadlineAtMs, batchSize }) => {
      evidenceCalls.push({ mailboxId: mailbox.id, uids: candidates.map((item) => item.uid), deadlineAtMs, batchSize });
      return {
        envelopes: candidates.map((item) => envelope({ uid: item.uid, messageId: item.messageId })),
        telemetry: {
          status: "COMPLETE",
          requestedCount: candidates.length,
          envelopeCount: candidates.length,
          evidenceFingerprints: candidates.map((item) => `fp-${item.uid}`)
        }
      };
    },
    projectPipeline: (pipeline) => {
      pipelineCalls += 1;
      projectedMessages = pipeline.messages;
      return emptyPipelineResult();
    }
  });

  assert.deepEqual(evidenceCalls, [{
    mailboxId: "personal",
    uids: ["102", "101"],
    deadlineAtMs: DEADLINE,
    batchSize: 20
  }]);
  assert.equal(pipelineCalls, 1);
  assert.equal(projectedMessages.length, 2);
  assert.deepEqual(result.telemetry.mailboxResults.map((item) => item.role), [
    "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
    "MARKETING_FUNNELKIT"
  ]);
  assert.equal(result.telemetry.candidateCount, 2);
  assert.equal(result.telemetry.envelopeCount, 2);
});

test("BASELINED and NO_NEW_MAIL zero-candidate results never fabricate evidence", async () => {
  const results = [
    syncResult(MAILBOXES[0], [], "BASELINED"),
    syncResult(MAILBOXES[1]),
    syncResult(MAILBOXES[2])
  ];
  let evidenceCalls = 0;
  let projectedCount = -1;

  const result = await projectCommittedIonosSyncToIntelligenceV1(input(results), {
    now: () => NOW_MS,
    fetchEvidence: async () => {
      evidenceCalls += 1;
      throw new Error("must not run");
    },
    projectPipeline: (pipeline) => {
      projectedCount = pipeline.messages.length;
      return emptyPipelineResult();
    }
  });

  assert.equal(evidenceCalls, 0);
  assert.equal(projectedCount, 0);
  assert.equal(result.telemetry.candidateCount, 0);
  assert.equal(result.telemetry.envelopeCount, 0);
});

test("one direct inbound committed message reaches canonical CRM relationship and intelligent inbox output", async () => {
  const directEnvelope = envelope();
  const results = [
    syncResult(MAILBOXES[0], [candidate(MAILBOXES[0])]),
    syncResult(MAILBOXES[1]),
    syncResult(MAILBOXES[2])
  ];

  const result = await projectCommittedIonosSyncToIntelligenceV1(input(results, pipelineInput(directEnvelope)), {
    now: () => NOW_MS,
    fetchEvidence: async ({ candidates }) => ({
      envelopes: [directEnvelope],
      telemetry: {
        status: "COMPLETE",
        requestedCount: candidates.length,
        envelopeCount: 1,
        evidenceFingerprints: ["safe-fingerprint"]
      }
    })
  });

  assert.equal(result.intelligence.crm.activities.length, 1);
  assert.equal(result.intelligence.relationship.projections.length, 1);
  assert.equal(result.intelligence.relationship.projections[0].primaryState, "NEEDS_REPLY");
  assert.equal(result.intelligence.inbox.needsReply.length, 1);
  assert.equal(result.intelligence.inbox.executiveAttention.length, 1);
  assert.equal(result.intelligence.inbox.executiveAttention[0].nextMoveStatus, "SUGGESTED_UNVERIFIED");
});

test("UNKNOWN evidence remains verification-gated through the composed canonical pipeline", async () => {
  const directEnvelope = envelope();
  const results = [
    syncResult(MAILBOXES[0], [candidate(MAILBOXES[0])]),
    syncResult(MAILBOXES[1]),
    syncResult(MAILBOXES[2])
  ];

  const result = await projectCommittedIonosSyncToIntelligenceV1(input(results, pipelineInput(directEnvelope, "UNKNOWN")), {
    now: () => NOW_MS,
    fetchEvidence: async () => ({
      envelopes: [directEnvelope],
      telemetry: {
        status: "COMPLETE",
        requestedCount: 1,
        envelopeCount: 1,
        evidenceFingerprints: ["safe-fingerprint"]
      }
    })
  });

  assert.ok(result.intelligence.crm.records.every((record) => !record.decisionEligible));
  assert.ok(result.intelligence.relationship.projections.every((projection) => !projection.decisionEligible));
  assert.ok(result.intelligence.inbox.requiresVerification.every((item) => !item.decisionEligible));
});

test("duplicate missing extra mismatched and failed mailbox evidence fails closed", async () => {
  const normal = MAILBOXES.map((mailbox) => syncResult(mailbox));
  const noCall = {
    now: () => NOW_MS,
    fetchEvidence: async () => {
      throw new Error("unexpected");
    },
    projectPipeline: () => emptyPipelineResult()
  };

  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1(input([normal[0], normal[0], normal[2]]), noCall),
    /IONOS_COMPOSITION_SYNC_RESULT_DUPLICATE/
  );
  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1({ ...input(normal), syncResults: normal.slice(0, 2) }, noCall),
    /IONOS_COMPOSITION_SYNC_RESULT_SET_INVALID/
  );
  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1({ ...input(normal), syncResults: [...normal, normal[0]] }, noCall),
    /IONOS_COMPOSITION_SYNC_RESULT_SET_INVALID/
  );
  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1(input([
      normal[0],
      { ...normal[1], role: "MARKETING_FUNNELKIT" },
      normal[2]
    ]), noCall),
    /IONOS_COMPOSITION_MAILBOX_RESULT_MISMATCH/
  );
  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1(input([
      { ...syncResult(MAILBOXES[0], [candidate(MAILBOXES[0])]), status: "FAILED", reason: "PROVIDER_RETRY_EXHAUSTED" },
      normal[1],
      normal[2]
    ]), noCall),
    /IONOS_COMPOSITION_SYNC_FAILED/
  );
});

test("batch and immutable deadline bounds fail closed before downstream projection", async () => {
  const two = [candidate(MAILBOXES[0], "100"), candidate(MAILBOXES[0], "101")];
  const results = [syncResult(MAILBOXES[0], two), syncResult(MAILBOXES[1]), syncResult(MAILBOXES[2])];
  let pipelineCalls = 0;

  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1({ ...input(results), evidenceBatchSize: 1 }, {
      now: () => NOW_MS,
      projectPipeline: () => {
        pipelineCalls += 1;
        return emptyPipelineResult();
      }
    }),
    /IONOS_COMPOSITION_BATCH_LIMIT_EXCEEDED/
  );
  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1({ ...input(results), deadlineAtMs: NOW_MS }, {
      now: () => NOW_MS
    }),
    /IONOS_COMPOSITION_DEADLINE_EXHAUSTED/
  );
  assert.equal(pipelineCalls, 0);
});

test("telemetry and surfaced failures contain no correspondence or credential material", async () => {
  const results = [
    syncResult(MAILBOXES[0], [candidate(MAILBOXES[0])]),
    syncResult(MAILBOXES[1]),
    syncResult(MAILBOXES[2])
  ];
  const result = await projectCommittedIonosSyncToIntelligenceV1(input(results), {
    now: () => NOW_MS,
    fetchEvidence: async () => ({
      envelopes: [envelope()],
      telemetry: {
        status: "COMPLETE",
        requestedCount: 1,
        envelopeCount: 1,
        evidenceFingerprints: ["safe-fingerprint"]
      }
    }),
    projectPipeline: () => emptyPipelineResult()
  });

  const telemetry = JSON.stringify(result.telemetry);
  assert.doesNotMatch(telemetry, /collector@|keegan@|private collector|personal-secret|assistant-secret|marketing-secret|op:\/\//i);

  await assert.rejects(
    projectCommittedIonosSyncToIntelligenceV1(input(results), {
      now: () => NOW_MS,
      fetchEvidence: async () => {
        throw new Error("collector@example.test personal-secret op://vault/item/password");
      }
    }),
    (error: unknown) => error instanceof Error && error.message === "IONOS_COMPOSITION_EVIDENCE_FAILURE"
  );
});

test("module exposes one read-only composition capability and no send mutation scheduler or persistence surface", () => {
  assert.deepEqual(Object.keys(compositionModule), ["projectCommittedIonosSyncToIntelligenceV1"]);
  assert.doesNotMatch(
    JSON.stringify(Object.keys(compositionModule)),
    /send|smtp|store|flag|copy|move|delete|expunge|append|schedule|persist|credential|secret|automatic/i
  );
});

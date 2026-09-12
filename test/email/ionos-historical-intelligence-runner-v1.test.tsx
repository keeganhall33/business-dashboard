import assert from "node:assert/strict";
import test from "node:test";

import * as runnerModule from "@/lib/email/ionos-historical-intelligence-runner-v1";
import {
  runIonosHistoricalIntelligencePreviewV1,
  type IonosHistoricalPreviewInputV1
} from "@/lib/email/ionos-historical-intelligence-runner-v1";
import { IONOS_MAILBOX_ROLES_V1 } from "@/lib/email/ionos-mailbox-config-v1";
import type { IonosReadonlyIntelligencePipelineResultV1 } from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";

const mailboxConfig = IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
  id: `mailbox-${index + 1}`,
  role,
  emailRef: `op://vault/mailbox-${index + 1}/email`,
  passwordRef: `op://vault/mailbox-${index + 1}/password`
}));

const addresses = new Map<string, string>([
  ["op://vault/mailbox-1/email", "owner@example.test"],
  ["op://vault/mailbox-2/email", "assistant@example.test"],
  ["op://vault/mailbox-3/email", "marketing@example.test"]
]);

const ranges = IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
  role,
  fromUid: String(index + 1),
  toUid: String(index + 10),
  expectedUidValidity: String(70 + index),
  batchSize: 10
}));

function pipelineResult(overrides: Partial<IonosReadonlyIntelligencePipelineResultV1["telemetry"]> = {}): IonosReadonlyIntelligencePipelineResultV1 {
  return {
    normalization: { records: [], rejections: [], consideredCount: 0, skippedOutsideHorizonCount: 0 },
    crm: {
      records: [],
      activities: [],
      contactTimelines: [],
      telemetry: {
        recordCount: 0,
        activityCount: 0,
        resolvedContactCount: 0,
        unknownParticipantCount: 0,
        ambiguousParticipantCount: 0,
        conflictedCompanyCount: 0,
        linkedEntityCount: 0,
        correctionCount: 0,
        recordFingerprints: []
      }
    },
    relationship: {
      generatedAt: "2026-09-12T16:00:00.000Z",
      projections: [],
      telemetry: {
        projectionCount: 0,
        needsReplyCount: 0,
        waitingOnContactCount: 0,
        staleThreadCount: 0,
        staleOpportunityCount: 0,
        highValueCount: 0,
        unknownCount: 0,
        conflictedCount: 0,
        projectionFingerprints: []
      }
    },
    inbox: {
      needsReply: [],
      waitingOnContact: [],
      staleThreads: [],
      highValue: [],
      activeAsks: [],
      commitmentSuggested: [],
      followUpSuggested: [],
      requiresVerification: [],
      executiveAttention: [],
      telemetry: {
        projectionCount: 0,
        needsReplyCount: 0,
        waitingOnContactCount: 0,
        staleThreadCount: 0,
        highValueCount: 0,
        activeAskCount: 0,
        commitmentSuggestedCount: 0,
        followUpSuggestedCount: 0,
        verificationRequiredCount: 0,
        executiveAttentionCount: 0,
        attentionBudget: 10
      }
    },
    verificationRequired: { canonicalEmailIds: [], relationshipProjectionIds: [] },
    telemetry: {
      consideredCount: 0,
      canonicalRecordCount: 0,
      rejectionCount: 0,
      crmActivityCount: 0,
      relationshipProjectionCount: 0,
      inboxAttentionCount: 0,
      verificationRequiredCount: 0,
      ...overrides
    }
  } as IonosReadonlyIntelligencePipelineResultV1;
}

function baseInput(overrides: Partial<IonosHistoricalPreviewInputV1> = {}): IonosHistoricalPreviewInputV1 {
  return {
    mailboxConfig,
    resolveSecretRef: async (reference) => addresses.get(reference) ?? "password-secret-value",
    ranges,
    deadlineAtMs: 10_000,
    pipeline: {
      horizon: { startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-12T16:00:00.000Z" },
      batchSize: 100,
      crm: { contacts: [], companyDomains: [], entityLinks: [], recordStates: [], corrections: [], now: "2026-09-12T16:00:00.000Z" },
      classifyActivities: () => [],
      relationship: { staleThreadDays: 7, staleOpportunityDays: 14, now: "2026-09-12T16:00:00.000Z" },
      inbox: { attentionBudget: 10, deepLinks: {} }
    },
    now: () => 1_000,
    ...overrides
  };
}

function candidate(mailbox: { id: string; role: (typeof IONOS_MAILBOX_ROLES_V1)[number] }, uidValidity: string, uid: string) {
  return {
    id: `ionos:${mailbox.id}:${uidValidity}:${uid}`,
    mailboxId: mailbox.id,
    role: mailbox.role,
    uidValidity,
    uid,
    messageId: `<${mailbox.id}-${uid}@example.test>`,
    internalDate: "2026-09-10T12:00:00.000Z",
    size: 100
  };
}

function envelope(mailbox: { id: string; role: (typeof IONOS_MAILBOX_ROLES_V1)[number] }, uidValidity: string, uid: string) {
  return {
    mailboxId: mailbox.id,
    role: mailbox.role,
    folder: "INBOX",
    uidValidity,
    uid,
    messageId: `<${mailbox.id}-${uid}@example.test>`,
    direction: "INBOUND" as const,
    participants: { from: ["contact@example.test"], to: ["owner@example.test"], cc: [], bcc: [] },
    sentAt: "2026-09-10T11:59:00.000Z",
    receivedAt: "2026-09-10T12:00:00.000Z",
    subject: "private subject",
    inReplyTo: null,
    references: [],
    body: { policy: "NONE" as const },
    attachments: [],
    sourceTimestamp: "2026-09-10T12:00:00.000Z"
  };
}

test("composes exactly three roles, forwards one immutable deadline, and projects one combined envelope set", async () => {
  const scanCalls: Array<{ role: string; deadlineAtMs: number }> = [];
  const evidenceCalls: Array<{ role: string; uids: string[]; deadlineAtMs: number }> = [];
  let projectedMessages: readonly unknown[] = [];
  let projectCount = 0;

  const result = await runIonosHistoricalIntelligencePreviewV1(baseInput({
    dependencies: {
      createAdapter: () => ({ openReadOnly: async () => { throw new Error("unused"); } }),
      scanCandidates: async ({ mailbox, expectedUidValidity, fromUid, deadlineAtMs }) => {
        scanCalls.push({ role: mailbox.role, deadlineAtMs });
        const item = candidate(mailbox, expectedUidValidity, fromUid);
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          candidates: [item],
          telemetry: {
            status: "SCANNED",
            fetchedCount: 1,
            candidateCount: 1,
            requestedRangeFingerprint: `request-${mailbox.role}`,
            effectiveRangeFingerprint: `effective-${mailbox.role}`
          }
        };
      },
      fetchEvidence: async ({ mailbox, candidates, deadlineAtMs }) => {
        evidenceCalls.push({ role: mailbox.role, uids: candidates.map((item) => item.uid), deadlineAtMs });
        return {
          envelopes: candidates.map((item) => envelope(mailbox, item.uidValidity, item.uid)),
          telemetry: {
            status: "COMPLETE",
            requestedCount: candidates.length,
            envelopeCount: candidates.length,
            evidenceFingerprints: candidates.map((item) => `evidence-${item.uid}`)
          }
        };
      },
      projectPipeline: (input) => {
        projectCount += 1;
        projectedMessages = input.messages;
        return pipelineResult({
          canonicalRecordCount: 3,
          crmActivityCount: 2,
          relationshipProjectionCount: 2,
          inboxAttentionCount: 1,
          verificationRequiredCount: 1
        });
      }
    }
  }));

  assert.deepEqual(scanCalls.map((call) => call.role), [...IONOS_MAILBOX_ROLES_V1]);
  assert.ok(scanCalls.every((call) => call.deadlineAtMs === 10_000));
  assert.ok(evidenceCalls.every((call) => call.deadlineAtMs === 10_000));
  assert.equal(projectCount, 1);
  assert.equal(projectedMessages.length, 3);
  assert.ok(projectedMessages.every((item: any) => item.body.policy === "NONE" && item.attachments.length === 0));
  assert.equal(result.telemetry.status, "COMPLETE");
  assert.equal(result.telemetry.canonicalRecordCount, 3);
  assert.equal(result.telemetry.crmActivityCount, 2);
  assert.equal(result.telemetry.relationshipProjectionCount, 2);
  assert.equal(result.telemetry.inboxAttentionCount, 1);
});

test("UIDVALIDITY failure is isolated to one mailbox and successful siblings still project", async () => {
  let projectCount = 0;
  const result = await runIonosHistoricalIntelligencePreviewV1(baseInput({
    dependencies: {
      createAdapter: () => ({ openReadOnly: async () => { throw new Error("unused"); } }),
      scanCandidates: async ({ mailbox }) => {
        if (mailbox.role === "ASSISTANT_CUSTOMER_SERVICE_OUTREACH") {
          throw new Error("IONOS_HISTORICAL_SCAN_UIDVALIDITY_MISMATCH");
        }
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          candidates: [],
          telemetry: {
            status: "NO_MESSAGES",
            fetchedCount: 0,
            candidateCount: 0,
            requestedRangeFingerprint: `request-${mailbox.role}`,
            effectiveRangeFingerprint: null
          }
        };
      },
      projectPipeline: (input) => {
        projectCount += 1;
        assert.deepEqual(input.messages, []);
        return pipelineResult();
      }
    }
  }));

  assert.equal(projectCount, 1);
  assert.equal(result.telemetry.status, "PARTIAL");
  assert.equal(result.telemetry.failedMailboxCount, 1);
  assert.equal(result.telemetry.successfulMailboxCount, 2);
  assert.equal(result.telemetry.mailboxes[1].reason, "UIDVALIDITY_MISMATCH");
});

test("zero messages is valid and fabricates no candidate or envelope intelligence", async () => {
  let projectCount = 0;
  const result = await runIonosHistoricalIntelligencePreviewV1(baseInput({
    dependencies: {
      createAdapter: () => ({ openReadOnly: async () => { throw new Error("unused"); } }),
      scanCandidates: async ({ mailbox }) => ({
        mailboxId: mailbox.id,
        role: mailbox.role,
        candidates: [],
        telemetry: {
          status: "NO_MESSAGES",
          fetchedCount: 0,
          candidateCount: 0,
          requestedRangeFingerprint: `request-${mailbox.role}`,
          effectiveRangeFingerprint: null
        }
      }),
      projectPipeline: (input) => {
        projectCount += 1;
        assert.equal(input.messages.length, 0);
        return pipelineResult();
      }
    }
  }));

  assert.equal(projectCount, 1);
  assert.equal(result.telemetry.status, "COMPLETE");
  assert.equal(result.telemetry.candidateCount, 0);
  assert.equal(result.telemetry.envelopeCount, 0);
  assert.ok(result.telemetry.mailboxes.every((mailbox) => mailbox.status === "NO_MESSAGES"));
});

test("unsafe body or attachment evidence fails closed before the canonical pipeline", async () => {
  let projected = false;
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewV1(baseInput({
      dependencies: {
        createAdapter: () => ({ openReadOnly: async () => { throw new Error("unused"); } }),
        scanCandidates: async ({ mailbox, expectedUidValidity, fromUid }) => {
          const item = candidate(mailbox, expectedUidValidity, fromUid);
          return {
            mailboxId: mailbox.id,
            role: mailbox.role,
            candidates: [item],
            telemetry: {
              status: "SCANNED",
              fetchedCount: 1,
              candidateCount: 1,
              requestedRangeFingerprint: "request",
              effectiveRangeFingerprint: "effective"
            }
          };
        },
        fetchEvidence: async ({ mailbox, candidates }) => ({
          envelopes: candidates.map((item) => ({
            ...envelope(mailbox, item.uidValidity, item.uid),
            body: { policy: "TEXT" as const, text: "private body" }
          })),
          telemetry: {
            status: "COMPLETE",
            requestedCount: candidates.length,
            envelopeCount: candidates.length,
            evidenceFingerprints: []
          }
        }),
        projectPipeline: () => {
          projected = true;
          return pipelineResult();
        }
      }
    })),
    /IONOS_HISTORICAL_PREVIEW_BODY_POLICY_INVALID/
  );
  assert.equal(projected, false);
});

test("range set and finite per-mailbox batch are validated before provider work", async () => {
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewV1(baseInput({ ranges: [ranges[0], ranges[0], ranges[2]] })),
    /RANGE_SET_INVALID/
  );
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewV1(baseInput({
      ranges: ranges.map((range, index) => index === 0 ? { ...range, batchSize: 0 } : range)
    })),
    /BATCH_INVALID/
  );
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewV1(baseInput({
      ranges: ranges.map((range, index) => index === 0 ? { ...range, batchSize: 1001 } : range)
    })),
    /BATCH_INVALID/
  );
});

test("privacy-safe telemetry excludes mailbox addresses, subjects, credentials, refs, and canonical ids", async () => {
  const result = await runIonosHistoricalIntelligencePreviewV1(baseInput({
    dependencies: {
      createAdapter: () => ({ openReadOnly: async () => { throw new Error("unused"); } }),
      scanCandidates: async ({ mailbox }) => ({
        mailboxId: mailbox.id,
        role: mailbox.role,
        candidates: [],
        telemetry: {
          status: "NO_MESSAGES",
          fetchedCount: 0,
          candidateCount: 0,
          requestedRangeFingerprint: "0123456789abcdef",
          effectiveRangeFingerprint: null
        }
      }),
      projectPipeline: () => pipelineResult({ verificationRequiredCount: 2 })
    }
  }));
  const serialized = JSON.stringify(result.telemetry);
  assert.doesNotMatch(serialized, /owner@example|assistant@example|marketing@example|private subject|password-secret|op:\/\//i);
  assert.doesNotMatch(serialized, /canonicalEmailIds|relationshipProjectionIds/i);
});

test("runtime export exposes one bounded preview runner and no send, scheduler, persistence, or mutation surface", () => {
  assert.deepEqual(Object.keys(runnerModule), ["runIonosHistoricalIntelligencePreviewV1"]);
  assert.doesNotMatch(JSON.stringify(Object.keys(runnerModule)), /send|smtp|scheduler|persist|cursor|mutation|credential/i);
});

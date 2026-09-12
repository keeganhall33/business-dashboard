import assert from "node:assert/strict";
import test from "node:test";

import * as commandModule from "../../scripts/run-ionos-historical-intelligence-preview-v1";
import { runIonosHistoricalIntelligencePreviewCommandV1 } from "../../scripts/run-ionos-historical-intelligence-preview-v1";
import { IONOS_MAILBOX_ROLES_V1 } from "@/lib/email/ionos-mailbox-config-v1";

const mailboxConfig = IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
  id: `mailbox-${index + 1}`,
  role,
  emailRef: `op://vault/mailbox-${index + 1}/email`,
  passwordRef: `op://vault/mailbox-${index + 1}/password`
}));

const previewConfig = {
  ranges: IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
    role,
    fromUid: String(index + 1),
    toUid: String(index + 10),
    expectedUidValidity: String(70 + index),
    batchSize: 10
  })),
  pipeline: {
    horizon: { startAt: "2026-09-01T00:00:00.000Z", endAt: "2026-09-12T16:00:00.000Z" },
    batchSize: 100,
    crm: { contacts: [], companyDomains: [], entityLinks: [], recordStates: [], corrections: [], now: "2026-09-12T16:00:00.000Z" },
    activityClassifications: [],
    relationship: { staleThreadDays: 7, staleOpportunityDays: 14, now: "2026-09-12T16:00:00.000Z" },
    inbox: { attentionBudget: 10, deepLinks: {} }
  }
};

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    IONOS_MAILBOX_CONFIG_JSON: JSON.stringify(mailboxConfig),
    IONOS_HISTORICAL_PREVIEW_JSON: JSON.stringify(previewConfig),
    IONOS_HISTORICAL_PREVIEW_TIMEOUT_MS: "120000",
    ...overrides
  };
}

function result(failedMailboxCount = 0) {
  return {
    intelligence: { privatePayload: "must-not-print" },
    telemetry: {
      status: failedMailboxCount ? "PARTIAL" : "COMPLETE",
      mailboxCount: 3,
      successfulMailboxCount: 3 - failedMailboxCount,
      failedMailboxCount,
      candidateCount: 2,
      envelopeCount: 2,
      canonicalRecordCount: 2,
      crmActivityCount: 1,
      relationshipProjectionCount: 1,
      inboxAttentionCount: 1,
      verificationRequiredCount: 0,
      rejectionCount: 0,
      mailboxes: IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
        role,
        status: failedMailboxCount && index === 1 ? "FAILED" : "SCANNED",
        reason: failedMailboxCount && index === 1 ? "PROVIDER_FAILED" : null,
        fetchedCount: index === 0 ? 2 : 0,
        candidateCount: index === 0 ? 2 : 0,
        envelopeCount: index === 0 ? 2 : 0,
        requestedRangeFingerprint: `range-${index}`,
        effectiveRangeFingerprint: index === 0 ? `effective-${index}` : null
      }))
    }
  } as any;
}

test("uses the approved shell-disabled 1Password boundary and prints telemetry only", async () => {
  const commandCalls: Array<{ file: string; args: readonly string[]; options: any }> = [];
  const output: string[] = [];
  let receivedDeadline = 0;
  let classificationCount = -1;

  const telemetry = await runIonosHistoricalIntelligencePreviewCommandV1({
    env: env(),
    now: () => 1_000,
    runCommand: async (file, args, options) => {
      commandCalls.push({ file, args, options });
      return { stdout: args[2]?.includes("email") ? "resolved@example.test" : "secret-password" };
    },
    runPreview: async (input) => {
      for (const mailbox of mailboxConfig) {
        await input.resolveSecretRef(mailbox.emailRef);
        await input.resolveSecretRef(mailbox.passwordRef);
      }
      receivedDeadline = input.deadlineAtMs;
      classificationCount = input.pipeline.classifyActivities({ activities: [] } as any).length;
      return result();
    },
    writeStdout: (text) => output.push(text)
  });

  assert.equal(receivedDeadline, 121_000);
  assert.equal(classificationCount, 0);
  assert.equal(commandCalls.length, 6);
  for (const call of commandCalls) {
    assert.equal(call.file, "op");
    assert.deepEqual(call.args.slice(0, 2), ["read", "--no-newline"]);
    assert.equal(call.options.shell, false);
    assert.equal(call.options.timeout, 120_000);
    assert.equal(call.options.maxBuffer, 64 * 1024);
    assert.equal(call.options.encoding, "utf8");
  }
  assert.equal(telemetry.status, "COMPLETE");
  assert.equal(output.length, 1);
  assert.match(output[0], /"canonicalRecordCount":2/);
  assert.doesNotMatch(output[0], /must-not-print|resolved@example|secret-password|op:\/\//i);
});

test("partial mailbox failure preserves redacted stdout summary and exits with one fixed failure code", async () => {
  const output: string[] = [];
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewCommandV1({
      env: env(),
      now: () => 1_000,
      runPreview: async () => result(1),
      writeStdout: (text) => output.push(text)
    }),
    /IONOS_HISTORICAL_PREVIEW_PARTIAL_FAILURE/
  );
  assert.equal(output.length, 1);
  assert.match(output[0], /"failedMailboxCount":1/);
  assert.match(output[0], /"reason":"PROVIDER_FAILED"/);
});

test("malformed config and unbounded timeout fail before any provider or secret work", async () => {
  let called = false;
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewCommandV1({
      env: env({ IONOS_HISTORICAL_PREVIEW_JSON: "{}" }),
      runCommand: async () => {
        called = true;
        return { stdout: "no" };
      }
    }),
    /IONOS_HISTORICAL_PREVIEW_JSON_INVALID/
  );
  assert.equal(called, false);

  await assert.rejects(
    runIonosHistoricalIntelligencePreviewCommandV1({
      env: env({ IONOS_HISTORICAL_PREVIEW_TIMEOUT_MS: "999999999" })
    }),
    /IONOS_HISTORICAL_PREVIEW_TIMEOUT_INVALID/
  );
});

test("secret command failures are reduced to fixed privacy-safe errors", async () => {
  await assert.rejects(
    runIonosHistoricalIntelligencePreviewCommandV1({
      env: env(),
      now: () => 1_000,
      runCommand: async () => {
        throw new Error("provider exposed owner@example.test op://vault/private/password");
      },
      runPreview: async (input) => {
        await input.resolveSecretRef(mailboxConfig[0].passwordRef);
        return result();
      }
    }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.equal(message, "IONOS_HISTORICAL_PREVIEW_SECRET_FAILED");
      assert.doesNotMatch(message, /owner@|op:\/\//i);
      return true;
    }
  );
});

test("activity classifications remain explicit caller evidence rather than inferred by the command", async () => {
  const configured = {
    ...previewConfig,
    pipeline: {
      ...previewConfig.pipeline,
      activityClassifications: [{
        activityId: "activity-1",
        canonicalEmailId: "email-1",
        contactId: "contact-1",
        threadId: "thread-1",
        direction: "INBOUND",
        classification: "DIRECT_HUMAN",
        mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        expectsReply: true,
        evidenceRef: "human-reviewed-classification",
        observedAt: "2026-09-12T15:00:00.000Z"
      }]
    }
  };
  let classifications: readonly unknown[] = [];
  await runIonosHistoricalIntelligencePreviewCommandV1({
    env: env({ IONOS_HISTORICAL_PREVIEW_JSON: JSON.stringify(configured) }),
    now: () => 1_000,
    runPreview: async (input) => {
      classifications = input.pipeline.classifyActivities({ activities: [] } as any);
      return result();
    },
    writeStdout: () => undefined
  });
  assert.deepEqual(classifications, configured.pipeline.activityClassifications);
});

test("runtime command surface contains no send, SMTP, scheduler, cursor, or persistence action", () => {
  assert.deepEqual(
    Object.keys(commandModule).sort(),
    ["mainIonosHistoricalIntelligencePreviewV1", "runIonosHistoricalIntelligencePreviewCommandV1"].sort()
  );
  assert.doesNotMatch(
    JSON.stringify(Object.keys(commandModule)),
    /send|smtp|scheduler|launchd|cursor|persist|writeMailbox|mutation/i
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { IONOS_MAILBOX_ROLES_V1 } from "@/lib/email/ionos-mailbox-config-v1";
import type {
  IonosHistoricalPreviewResultV1,
  IonosHistoricalPreviewTelemetryV1
} from "@/lib/email/ionos-historical-intelligence-runner-v1";
import { runIonosHistoricalIntelligencePreviewCommandV1 } from "../../scripts/run-ionos-historical-intelligence-preview-v1";

const mailboxConfig = IONOS_MAILBOX_ROLES_V1.map((role, index) => ({
  id: `mailbox-${index + 1}`,
  role,
  emailRef: `op://vault/mailbox-${index + 1}/email`,
  passwordRef: `op://vault/mailbox-${index + 1}/password`
}));

function productionEnv(): Record<string, string> {
  return {
    IONOS_MAILBOX_CONFIG_JSON: JSON.stringify(mailboxConfig),
    IONOS_HISTORICAL_PREVIEW_JSON: JSON.stringify({
      ranges: [],
      pipeline: { activityClassifications: [] }
    }),
    V4_PRODUCTION_TASK_ID: "ionos-live-proof",
    V4_PRODUCTION_ISSUE_NUMBER: "1740",
    OPENCLAW_WORKSPACE_DIR: "/tmp/business-dashboard-ionos-proof"
  };
}

function telemetryWithCounts(
  overrides: Partial<Pick<
    IonosHistoricalPreviewTelemetryV1,
    | "candidateCount"
    | "envelopeCount"
    | "canonicalRecordCount"
    | "crmActivityCount"
    | "relationshipProjectionCount"
    | "inboxAttentionCount"
  >> = {}
): IonosHistoricalPreviewTelemetryV1 {
  return {
    status: "COMPLETE",
    mailboxCount: 3,
    successfulMailboxCount: 3,
    failedMailboxCount: 0,
    candidateCount: 0,
    envelopeCount: 0,
    canonicalRecordCount: 0,
    crmActivityCount: 0,
    relationshipProjectionCount: 0,
    inboxAttentionCount: 0,
    verificationRequiredCount: 0,
    rejectionCount: 0,
    mailboxes: IONOS_MAILBOX_ROLES_V1.map((role) => ({
      role,
      status: "NO_MESSAGES",
      reason: null,
      fetchedCount: 0,
      candidateCount: 0,
      envelopeCount: 0,
      requestedRangeFingerprint: "request-fingerprint",
      effectiveRangeFingerprint: "effective-fingerprint"
    })),
    ...overrides
  };
}

function previewResult(telemetry: IonosHistoricalPreviewTelemetryV1): IonosHistoricalPreviewResultV1 {
  return {
    intelligence: {} as IonosHistoricalPreviewResultV1["intelligence"],
    telemetry
  };
}

test("production evidence fails closed when all three live mailboxes contain no real historical correspondence", async () => {
  let commandCalls = 0;

  await assert.rejects(
    () =>
      runIonosHistoricalIntelligencePreviewCommandV1({
        env: productionEnv(),
        runPreview: async () => previewResult(telemetryWithCounts()),
        runCommand: async () => {
          commandCalls += 1;
          return { stdout: "" };
        },
        writeStdout: () => undefined,
        now: () => 1_000
      }),
    /IONOS_HISTORICAL_PREVIEW_EVIDENCE_TELEMETRY_INVALID/
  );

  assert.equal(commandCalls, 0);
});

test("production evidence requires correspondence to reach canonical CRM and relationship intelligence", async () => {
  const incompleteChains = [
    telemetryWithCounts({ candidateCount: 3 }),
    telemetryWithCounts({ candidateCount: 3, envelopeCount: 3 }),
    telemetryWithCounts({ candidateCount: 3, envelopeCount: 3, canonicalRecordCount: 3 }),
    telemetryWithCounts({ candidateCount: 3, envelopeCount: 3, canonicalRecordCount: 3, crmActivityCount: 2 })
  ];

  for (const telemetry of incompleteChains) {
    await assert.rejects(
      () =>
        runIonosHistoricalIntelligencePreviewCommandV1({
          env: productionEnv(),
          runPreview: async () => previewResult(telemetry),
          runCommand: async () => ({ stdout: "" }),
          writeStdout: () => undefined,
          now: () => 1_000
        }),
      /IONOS_HISTORICAL_PREVIEW_EVIDENCE_TELEMETRY_INVALID/
    );
  }
});

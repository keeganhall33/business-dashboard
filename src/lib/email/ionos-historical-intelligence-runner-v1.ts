import {
  IONOS_MAILBOX_ROLES_V1,
  resolveIonosMailboxConfigV1,
  type IonosMailboxRoleV1,
  type IonosMailboxRuntimeV1
} from "@/lib/email/ionos-mailbox-config-v1";
import { createIonosImapReadAdapterV1 } from "@/lib/email/ionos-imap-read-adapter-v1";
import {
  scanIonosHistoricalCandidatesV1,
  type IonosHistoricalCandidateScanResultV1
} from "@/lib/email/ionos-historical-candidate-scan-v1";
import {
  fetchIonosMessageEvidenceV1,
  type IonosMessageEvidenceResultV1
} from "@/lib/email/ionos-message-evidence-adapter-v1";
import {
  projectIonosReadonlyIntelligencePipelineV1,
  type IonosReadonlyIntelligencePipelineInputV1,
  type IonosReadonlyIntelligencePipelineResultV1
} from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";
import type { EmailProviderAdapterV1 } from "@/lib/email/ionos-incremental-sync-v1";
import type { HistoricalEmailEnvelopeV1 } from "@/lib/email/ionos-email-normalization-v1";

export type IonosHistoricalPreviewRangeV1 = {
  role: IonosMailboxRoleV1;
  fromUid: string;
  toUid: string;
  expectedUidValidity: string;
  batchSize: number;
};

export type IonosHistoricalPreviewMailboxTelemetryV1 = {
  role: IonosMailboxRoleV1;
  status: "SCANNED" | "NO_MESSAGES" | "FAILED";
  reason:
    | null
    | "UIDVALIDITY_MISMATCH"
    | "DEADLINE_EXHAUSTED"
    | "PROVIDER_FAILED"
    | "EVIDENCE_FAILED"
    | "VALIDATION_FAILED";
  fetchedCount: number;
  candidateCount: number;
  envelopeCount: number;
  requestedRangeFingerprint: string | null;
  effectiveRangeFingerprint: string | null;
};

export type IonosHistoricalPreviewTelemetryV1 = {
  status: "COMPLETE" | "PARTIAL";
  mailboxCount: 3;
  successfulMailboxCount: number;
  failedMailboxCount: number;
  candidateCount: number;
  envelopeCount: number;
  canonicalRecordCount: number;
  crmActivityCount: number;
  relationshipProjectionCount: number;
  inboxAttentionCount: number;
  verificationRequiredCount: number;
  rejectionCount: number;
  mailboxes: readonly IonosHistoricalPreviewMailboxTelemetryV1[];
};

export type IonosHistoricalPreviewResultV1 = {
  intelligence: IonosReadonlyIntelligencePipelineResultV1;
  telemetry: IonosHistoricalPreviewTelemetryV1;
};

type HistoricalScannerV1 = typeof scanIonosHistoricalCandidatesV1;
type EvidenceFetcherV1 = typeof fetchIonosMessageEvidenceV1;
type PipelineProjectorV1 = typeof projectIonosReadonlyIntelligencePipelineV1;

export type IonosHistoricalPreviewDependenciesV1 = {
  createAdapter?: (input: { now?: () => number }) => EmailProviderAdapterV1;
  scanCandidates?: HistoricalScannerV1;
  fetchEvidence?: EvidenceFetcherV1;
  projectPipeline?: PipelineProjectorV1;
};

export type IonosHistoricalPreviewInputV1 = {
  mailboxConfig: unknown;
  resolveSecretRef: (reference: string) => string | Promise<string>;
  ranges: readonly IonosHistoricalPreviewRangeV1[];
  deadlineAtMs: number;
  pipeline: Omit<IonosReadonlyIntelligencePipelineInputV1, "messages">;
  now?: () => number;
  dependencies?: IonosHistoricalPreviewDependenciesV1;
};

const INPUT_KEYS = new Set([
  "mailboxConfig",
  "resolveSecretRef",
  "ranges",
  "deadlineAtMs",
  "pipeline",
  "now",
  "dependencies"
]);
const DEPENDENCY_KEYS = new Set([
  "createAdapter",
  "scanCandidates",
  "fetchEvidence",
  "projectPipeline"
]);
const RANGE_KEYS = new Set([
  "role",
  "fromUid",
  "toUid",
  "expectedUidValidity",
  "batchSize"
]);
const MAX_BATCH_SIZE = 1_000;

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) fail("IONOS_HISTORICAL_PREVIEW_CLOCK_INVALID");
  return value;
}

function isRole(value: unknown): value is IonosMailboxRoleV1 {
  return typeof value === "string" && (IONOS_MAILBOX_ROLES_V1 as readonly string[]).includes(value);
}

function roleIndex(role: IonosMailboxRoleV1): number {
  return IONOS_MAILBOX_ROLES_V1.indexOf(role);
}

function validateRange(value: unknown): IonosHistoricalPreviewRangeV1 {
  if (!isPlainObject(value) || Object.keys(value).some((key) => !RANGE_KEYS.has(key))) {
    return fail("IONOS_HISTORICAL_PREVIEW_RANGE_INVALID");
  }
  if (!isRole(value.role)) fail("IONOS_HISTORICAL_PREVIEW_RANGE_ROLE_INVALID");
  for (const key of ["fromUid", "toUid", "expectedUidValidity"] as const) {
    if (typeof value[key] !== "string" || !/^(0|[1-9]\d*)$/.test(value[key] as string)) {
      fail("IONOS_HISTORICAL_PREVIEW_RANGE_INVALID");
    }
  }
  if (BigInt(value.fromUid as string) < BigInt(1) || BigInt(value.toUid as string) < BigInt(value.fromUid as string)) {
    fail("IONOS_HISTORICAL_PREVIEW_RANGE_INVALID");
  }
  if (
    typeof value.batchSize !== "number" ||
    !Number.isSafeInteger(value.batchSize) ||
    value.batchSize < 1 ||
    value.batchSize > MAX_BATCH_SIZE
  ) {
    fail("IONOS_HISTORICAL_PREVIEW_BATCH_INVALID");
  }
  return {
    role: value.role,
    fromUid: value.fromUid as string,
    toUid: value.toUid as string,
    expectedUidValidity: value.expectedUidValidity as string,
    batchSize: value.batchSize
  };
}

function validateInput(input: IonosHistoricalPreviewInputV1): {
  now: () => number;
  rangesByRole: Map<IonosMailboxRoleV1, IonosHistoricalPreviewRangeV1>;
} {
  if (!isPlainObject(input) || Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    fail("IONOS_HISTORICAL_PREVIEW_INPUT_INVALID");
  }
  if (typeof input.resolveSecretRef !== "function") fail("IONOS_HISTORICAL_PREVIEW_SECRET_RESOLVER_INVALID");
  if (!Array.isArray(input.ranges) || input.ranges.length !== IONOS_MAILBOX_ROLES_V1.length) {
    fail("IONOS_HISTORICAL_PREVIEW_RANGE_SET_INVALID");
  }
  if (!isPlainObject(input.pipeline)) fail("IONOS_HISTORICAL_PREVIEW_PIPELINE_INPUT_INVALID");
  if (!Number.isSafeInteger(input.deadlineAtMs) || input.deadlineAtMs < 1) {
    fail("IONOS_HISTORICAL_PREVIEW_DEADLINE_INVALID");
  }
  const now = input.now ?? Date.now;
  if (typeof now !== "function") fail("IONOS_HISTORICAL_PREVIEW_CLOCK_INVALID");
  if (input.deadlineAtMs <= safeNow(now)) fail("IONOS_HISTORICAL_PREVIEW_DEADLINE_EXHAUSTED");

  if (input.dependencies != null) {
    if (!isPlainObject(input.dependencies) || Object.keys(input.dependencies).some((key) => !DEPENDENCY_KEYS.has(key))) {
      fail("IONOS_HISTORICAL_PREVIEW_DEPENDENCIES_INVALID");
    }
    for (const key of DEPENDENCY_KEYS) {
      const dependency = input.dependencies[key as keyof IonosHistoricalPreviewDependenciesV1];
      if (dependency != null && typeof dependency !== "function") {
        fail("IONOS_HISTORICAL_PREVIEW_DEPENDENCIES_INVALID");
      }
    }
  }

  const rangesByRole = new Map<IonosMailboxRoleV1, IonosHistoricalPreviewRangeV1>();
  for (const raw of input.ranges) {
    const range = validateRange(raw);
    if (rangesByRole.has(range.role)) fail("IONOS_HISTORICAL_PREVIEW_RANGE_SET_INVALID");
    rangesByRole.set(range.role, range);
  }
  for (const role of IONOS_MAILBOX_ROLES_V1) {
    if (!rangesByRole.has(role)) fail("IONOS_HISTORICAL_PREVIEW_RANGE_SET_INVALID");
  }
  return { now, rangesByRole };
}

function redactedError(error: unknown, secrets: ReadonlySet<string>): Error {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message.replace(/op:\/\/[^\s,;]+/gi, "[REDACTED_REFERENCE]");
  message = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  return new Error(message);
}

function safeReason(error: unknown): IonosHistoricalPreviewMailboxTelemetryV1["reason"] {
  const code = error instanceof Error ? error.message : "";
  if (code === "IONOS_HISTORICAL_SCAN_UIDVALIDITY_MISMATCH") return "UIDVALIDITY_MISMATCH";
  if (
    code.includes("DEADLINE_EXHAUSTED") ||
    code === "IONOS_HISTORICAL_PREVIEW_DEADLINE_EXHAUSTED"
  ) return "DEADLINE_EXHAUSTED";
  if (code === "IONOS_HISTORICAL_SCAN_PROVIDER_FAILED" || code.includes("IONOS_IMAP_")) {
    return "PROVIDER_FAILED";
  }
  if (code.startsWith("IONOS_EVIDENCE_")) return "EVIDENCE_FAILED";
  return "VALIDATION_FAILED";
}

function assertSafeEnvelope(envelope: HistoricalEmailEnvelopeV1): void {
  if (envelope.body?.policy !== "NONE") fail("IONOS_HISTORICAL_PREVIEW_BODY_POLICY_INVALID");
  if (!Array.isArray(envelope.attachments) || envelope.attachments.length !== 0) {
    fail("IONOS_HISTORICAL_PREVIEW_ATTACHMENT_POLICY_INVALID");
  }
}

function emptyMailboxTelemetry(
  role: IonosMailboxRoleV1,
  reason: IonosHistoricalPreviewMailboxTelemetryV1["reason"]
): IonosHistoricalPreviewMailboxTelemetryV1 {
  return {
    role,
    status: "FAILED",
    reason,
    fetchedCount: 0,
    candidateCount: 0,
    envelopeCount: 0,
    requestedRangeFingerprint: null,
    effectiveRangeFingerprint: null
  };
}

function sortedMailboxes(mailboxes: readonly IonosMailboxRuntimeV1[]): IonosMailboxRuntimeV1[] {
  if (!Array.isArray(mailboxes) || mailboxes.length !== IONOS_MAILBOX_ROLES_V1.length) {
    fail("IONOS_HISTORICAL_PREVIEW_MAILBOX_SET_INVALID");
  }
  const seen = new Set<IonosMailboxRoleV1>();
  for (const mailbox of mailboxes) {
    if (!mailbox || !isRole(mailbox.role) || mailbox.smtpEnabled !== false || seen.has(mailbox.role)) {
      fail("IONOS_HISTORICAL_PREVIEW_MAILBOX_SET_INVALID");
    }
    seen.add(mailbox.role);
  }
  return [...mailboxes].sort((left, right) => roleIndex(left.role) - roleIndex(right.role));
}

export async function runIonosHistoricalIntelligencePreviewV1(
  input: IonosHistoricalPreviewInputV1
): Promise<IonosHistoricalPreviewResultV1> {
  const secrets = new Set<string>();
  try {
    const { now, rangesByRole } = validateInput(input);
    const mailboxes = sortedMailboxes(await resolveIonosMailboxConfigV1(
      input.mailboxConfig,
      async (reference) => {
        const value = await input.resolveSecretRef(reference);
        if (typeof value === "string" && value) secrets.add(value);
        return value;
      }
    ));

    const createAdapter = input.dependencies?.createAdapter ??
      (({ now: clock }: { now?: () => number }) => createIonosImapReadAdapterV1({ now: clock }));
    const scanCandidates = input.dependencies?.scanCandidates ?? scanIonosHistoricalCandidatesV1;
    const fetchEvidence = input.dependencies?.fetchEvidence ?? fetchIonosMessageEvidenceV1;
    const projectPipeline = input.dependencies?.projectPipeline ?? projectIonosReadonlyIntelligencePipelineV1;
    const adapter = createAdapter({ now });
    if (!adapter || typeof adapter.openReadOnly !== "function") fail("IONOS_HISTORICAL_PREVIEW_ADAPTER_INVALID");

    const envelopes: HistoricalEmailEnvelopeV1[] = [];
    const mailboxTelemetry: IonosHistoricalPreviewMailboxTelemetryV1[] = [];

    for (const mailbox of mailboxes) {
      const range = rangesByRole.get(mailbox.role)!;
      if (safeNow(now) >= input.deadlineAtMs) {
        mailboxTelemetry.push(emptyMailboxTelemetry(mailbox.role, "DEADLINE_EXHAUSTED"));
        continue;
      }

      let scan: IonosHistoricalCandidateScanResultV1;
      try {
        scan = await scanCandidates({
          mailbox,
          adapter,
          fromUid: range.fromUid,
          toUid: range.toUid,
          batchSize: range.batchSize,
          deadlineAtMs: input.deadlineAtMs,
          expectedUidValidity: range.expectedUidValidity,
          now
        });
      } catch (error) {
        mailboxTelemetry.push(emptyMailboxTelemetry(mailbox.role, safeReason(error)));
        continue;
      }

      if (!Array.isArray(scan.candidates) || scan.telemetry.candidateCount !== scan.candidates.length) {
        mailboxTelemetry.push(emptyMailboxTelemetry(mailbox.role, "VALIDATION_FAILED"));
        continue;
      }

      if (scan.candidates.length === 0) {
        mailboxTelemetry.push({
          role: mailbox.role,
          status: "NO_MESSAGES",
          reason: null,
          fetchedCount: scan.telemetry.fetchedCount,
          candidateCount: 0,
          envelopeCount: 0,
          requestedRangeFingerprint: scan.telemetry.requestedRangeFingerprint,
          effectiveRangeFingerprint: scan.telemetry.effectiveRangeFingerprint
        });
        continue;
      }

      let evidence: IonosMessageEvidenceResultV1;
      try {
        evidence = await fetchEvidence({
          mailbox,
          candidates: scan.candidates,
          batchSize: range.batchSize,
          deadlineAtMs: input.deadlineAtMs,
          now
        });
      } catch (error) {
        mailboxTelemetry.push({
          role: mailbox.role,
          status: "FAILED",
          reason: safeReason(error),
          fetchedCount: scan.telemetry.fetchedCount,
          candidateCount: scan.candidates.length,
          envelopeCount: 0,
          requestedRangeFingerprint: scan.telemetry.requestedRangeFingerprint,
          effectiveRangeFingerprint: scan.telemetry.effectiveRangeFingerprint
        });
        continue;
      }

      if (
        !Array.isArray(evidence.envelopes) ||
        evidence.telemetry.requestedCount !== scan.candidates.length ||
        evidence.telemetry.envelopeCount !== evidence.envelopes.length ||
        evidence.envelopes.length !== scan.candidates.length
      ) {
        mailboxTelemetry.push({
          role: mailbox.role,
          status: "FAILED",
          reason: "EVIDENCE_FAILED",
          fetchedCount: scan.telemetry.fetchedCount,
          candidateCount: scan.candidates.length,
          envelopeCount: 0,
          requestedRangeFingerprint: scan.telemetry.requestedRangeFingerprint,
          effectiveRangeFingerprint: scan.telemetry.effectiveRangeFingerprint
        });
        continue;
      }

      for (const envelope of evidence.envelopes) assertSafeEnvelope(envelope);
      envelopes.push(...evidence.envelopes);
      mailboxTelemetry.push({
        role: mailbox.role,
        status: "SCANNED",
        reason: null,
        fetchedCount: scan.telemetry.fetchedCount,
        candidateCount: scan.candidates.length,
        envelopeCount: evidence.envelopes.length,
        requestedRangeFingerprint: scan.telemetry.requestedRangeFingerprint,
        effectiveRangeFingerprint: scan.telemetry.effectiveRangeFingerprint
      });
    }

    let intelligence: IonosReadonlyIntelligencePipelineResultV1;
    try {
      intelligence = projectPipeline({ ...input.pipeline, messages: envelopes });
    } catch {
      fail("IONOS_HISTORICAL_PREVIEW_PIPELINE_FAILURE");
    }

    const failedMailboxCount = mailboxTelemetry.filter((mailbox) => mailbox.status === "FAILED").length;
    return {
      intelligence,
      telemetry: {
        status: failedMailboxCount > 0 ? "PARTIAL" : "COMPLETE",
        mailboxCount: 3,
        successfulMailboxCount: mailboxTelemetry.length - failedMailboxCount,
        failedMailboxCount,
        candidateCount: mailboxTelemetry.reduce((total, mailbox) => total + mailbox.candidateCount, 0),
        envelopeCount: envelopes.length,
        canonicalRecordCount: intelligence.telemetry.canonicalRecordCount,
        crmActivityCount: intelligence.telemetry.crmActivityCount,
        relationshipProjectionCount: intelligence.telemetry.relationshipProjectionCount,
        inboxAttentionCount: intelligence.telemetry.inboxAttentionCount,
        verificationRequiredCount: intelligence.telemetry.verificationRequiredCount,
        rejectionCount: intelligence.telemetry.rejectionCount,
        mailboxes: mailboxTelemetry
      }
    };
  } catch (error) {
    throw redactedError(error, secrets);
  }
}

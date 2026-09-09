import {
  fetchIonosMessageEvidenceV1,
  type IonosMessageEvidenceResultV1
} from "@/lib/email/ionos-message-evidence-adapter-v1";
import type { HistoricalEmailEnvelopeV1 } from "@/lib/email/ionos-email-normalization-v1";
import type { EmailMailboxSyncResultV1 } from "@/lib/email/ionos-incremental-sync-v1";
import {
  IONOS_MAILBOX_ROLES_V1,
  type IonosMailboxRoleV1,
  type IonosMailboxRuntimeV1
} from "@/lib/email/ionos-mailbox-config-v1";
import {
  projectIonosReadonlyIntelligencePipelineV1,
  type IonosReadonlyIntelligencePipelineInputV1,
  type IonosReadonlyIntelligencePipelineResultV1
} from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";

export type IonosSyncToIntelligenceInputV1 = {
  mailboxes: readonly IonosMailboxRuntimeV1[];
  syncResults: readonly EmailMailboxSyncResultV1[];
  evidenceBatchSize: number;
  deadlineAtMs: number;
  pipeline: Omit<IonosReadonlyIntelligencePipelineInputV1, "messages">;
};

export type IonosSyncToIntelligenceTelemetryV1 = {
  status: "COMPLETE";
  mailboxCount: number;
  candidateCount: number;
  envelopeCount: number;
  mailboxResults: readonly {
    mailboxId: string;
    role: IonosMailboxRoleV1;
    syncStatus: EmailMailboxSyncResultV1["status"];
    candidateCount: number;
    envelopeCount: number;
    evidenceFingerprints: readonly string[];
  }[];
};

export type IonosSyncToIntelligenceResultV1 = {
  intelligence: IonosReadonlyIntelligencePipelineResultV1;
  telemetry: IonosSyncToIntelligenceTelemetryV1;
};

type EvidenceFetcherV1 = (input: {
  mailbox: IonosMailboxRuntimeV1;
  candidates: EmailMailboxSyncResultV1["candidates"];
  batchSize: number;
  deadlineAtMs: number;
}) => Promise<IonosMessageEvidenceResultV1>;

type PipelineProjectorV1 = (
  input: IonosReadonlyIntelligencePipelineInputV1
) => IonosReadonlyIntelligencePipelineResultV1;

export type IonosSyncToIntelligenceDependenciesV1 = {
  fetchEvidence?: EvidenceFetcherV1;
  projectPipeline?: PipelineProjectorV1;
  now?: () => number;
};

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMailboxRole(value: unknown): value is IonosMailboxRoleV1 {
  return typeof value === "string" && (IONOS_MAILBOX_ROLES_V1 as readonly string[]).includes(value);
}

function safeInteger(value: unknown, code: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    return fail(code);
  }
  return value;
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.trim();
}

function nowValue(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) return fail("IONOS_COMPOSITION_CLOCK_INVALID");
  return value;
}

function assertDeadline(deadlineAtMs: number, now: () => number): void {
  safeInteger(deadlineAtMs, "IONOS_COMPOSITION_DEADLINE_INVALID", 1);
  if (deadlineAtMs <= nowValue(now)) fail("IONOS_COMPOSITION_DEADLINE_EXHAUSTED");
}

function roleIndex(role: IonosMailboxRoleV1): number {
  const index = IONOS_MAILBOX_ROLES_V1.indexOf(role);
  if (index < 0) return fail("IONOS_COMPOSITION_ROLE_INVALID");
  return index;
}

function validateMailboxSet(value: readonly IonosMailboxRuntimeV1[]): IonosMailboxRuntimeV1[] {
  if (!Array.isArray(value) || value.length !== IONOS_MAILBOX_ROLES_V1.length) {
    return fail("IONOS_COMPOSITION_MAILBOX_SET_INVALID");
  }

  const ids = new Set<string>();
  const roles = new Set<IonosMailboxRoleV1>();
  const mailboxes = value.map((mailbox) => {
    if (mailbox == null || typeof mailbox !== "object" || Array.isArray(mailbox) || mailbox.smtpEnabled !== false) {
      return fail("IONOS_COMPOSITION_MAILBOX_INVALID");
    }
    const id = text(mailbox.id, "IONOS_COMPOSITION_MAILBOX_INVALID");
    const role = mailbox.role;
    if (!isMailboxRole(role)) return fail("IONOS_COMPOSITION_ROLE_INVALID");
    if (ids.has(id) || roles.has(role)) return fail("IONOS_COMPOSITION_MAILBOX_DUPLICATE");
    ids.add(id);
    roles.add(role);
    return mailbox;
  });

  for (const role of IONOS_MAILBOX_ROLES_V1) {
    if (!roles.has(role)) fail("IONOS_COMPOSITION_MAILBOX_SET_INVALID");
  }

  return [...mailboxes].sort((left, right) => roleIndex(left.role) - roleIndex(right.role));
}

function validateResultSet(
  value: readonly EmailMailboxSyncResultV1[],
  mailboxes: readonly IonosMailboxRuntimeV1[]
): Map<string, EmailMailboxSyncResultV1> {
  if (!Array.isArray(value) || value.length !== mailboxes.length) {
    return fail("IONOS_COMPOSITION_SYNC_RESULT_SET_INVALID");
  }

  const byId = new Map<string, EmailMailboxSyncResultV1>();
  for (const result of value) {
    if (result == null || typeof result !== "object" || Array.isArray(result) || !Array.isArray(result.candidates)) {
      return fail("IONOS_COMPOSITION_SYNC_RESULT_INVALID");
    }
    const mailboxId = text(result.mailboxId, "IONOS_COMPOSITION_SYNC_RESULT_INVALID");
    if (byId.has(mailboxId)) return fail("IONOS_COMPOSITION_SYNC_RESULT_DUPLICATE");
    safeInteger(result.candidateCount, "IONOS_COMPOSITION_SYNC_RESULT_INVALID");
    safeInteger(result.fetchedCount, "IONOS_COMPOSITION_SYNC_RESULT_INVALID");
    safeInteger(result.retryCount, "IONOS_COMPOSITION_SYNC_RESULT_INVALID");
    if (result.candidateCount !== result.candidates.length) {
      return fail("IONOS_COMPOSITION_CANDIDATE_COUNT_MISMATCH");
    }
    if (result.status === "FAILED") return fail("IONOS_COMPOSITION_SYNC_FAILED");
    if (result.candidateCount > 0 && result.status !== "SYNCED") {
      return fail("IONOS_COMPOSITION_CANDIDATE_STATUS_INVALID");
    }
    byId.set(mailboxId, result);
  }

  for (const mailbox of mailboxes) {
    const result = byId.get(mailbox.id);
    if (!result || result.role !== mailbox.role) {
      return fail("IONOS_COMPOSITION_MAILBOX_RESULT_MISMATCH");
    }
    for (const candidate of result.candidates) {
      if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
        return fail("IONOS_COMPOSITION_CANDIDATE_INVALID");
      }
      if (candidate.mailboxId !== mailbox.id || candidate.role !== mailbox.role) {
        return fail("IONOS_COMPOSITION_CANDIDATE_MAILBOX_MISMATCH");
      }
    }
  }

  return byId;
}

export async function projectCommittedIonosSyncToIntelligenceV1(
  input: IonosSyncToIntelligenceInputV1,
  dependencies: IonosSyncToIntelligenceDependenciesV1 = {}
): Promise<IonosSyncToIntelligenceResultV1> {
  if (!isPlainObject(input)) return fail("IONOS_COMPOSITION_INPUT_INVALID");
  if (!isPlainObject(input.pipeline)) return fail("IONOS_COMPOSITION_PIPELINE_INPUT_INVALID");
  const evidenceBatchSize = safeInteger(
    input.evidenceBatchSize,
    "IONOS_COMPOSITION_BATCH_SIZE_INVALID",
    1
  );
  const now = dependencies.now ?? Date.now;
  if (typeof now !== "function") return fail("IONOS_COMPOSITION_CLOCK_INVALID");
  assertDeadline(input.deadlineAtMs, now);

  const mailboxes = validateMailboxSet(input.mailboxes);
  const resultsById = validateResultSet(input.syncResults, mailboxes);
  const fetchEvidence: EvidenceFetcherV1 =
    dependencies.fetchEvidence ?? ((evidenceInput) => fetchIonosMessageEvidenceV1(evidenceInput));
  const projectPipeline = dependencies.projectPipeline ?? projectIonosReadonlyIntelligencePipelineV1;
  if (typeof fetchEvidence !== "function" || typeof projectPipeline !== "function") {
    return fail("IONOS_COMPOSITION_DEPENDENCY_INVALID");
  }

  const envelopes: HistoricalEmailEnvelopeV1[] = [];
  const mailboxResults: IonosSyncToIntelligenceTelemetryV1["mailboxResults"][number][] = [];
  let candidateCount = 0;

  for (const mailbox of mailboxes) {
    assertDeadline(input.deadlineAtMs, now);
    const syncResult = resultsById.get(mailbox.id)!;
    candidateCount += syncResult.candidateCount;

    if (syncResult.candidates.length === 0) {
      mailboxResults.push({
        mailboxId: mailbox.id,
        role: mailbox.role,
        syncStatus: syncResult.status,
        candidateCount: 0,
        envelopeCount: 0,
        evidenceFingerprints: []
      });
      continue;
    }
    if (syncResult.candidates.length > evidenceBatchSize) {
      return fail("IONOS_COMPOSITION_BATCH_LIMIT_EXCEEDED");
    }

    let evidence: IonosMessageEvidenceResultV1;
    try {
      evidence = await fetchEvidence({
        mailbox,
        candidates: syncResult.candidates,
        batchSize: evidenceBatchSize,
        deadlineAtMs: input.deadlineAtMs
      });
    } catch {
      return fail("IONOS_COMPOSITION_EVIDENCE_FAILURE");
    }
    assertDeadline(input.deadlineAtMs, now);
    if (!isPlainObject(evidence) || !Array.isArray(evidence.envelopes) || !isPlainObject(evidence.telemetry)) {
      return fail("IONOS_COMPOSITION_EVIDENCE_INVALID");
    }
    if (
      evidence.telemetry.status !== "COMPLETE" ||
      evidence.telemetry.requestedCount !== syncResult.candidateCount ||
      evidence.telemetry.envelopeCount !== syncResult.candidateCount ||
      evidence.envelopes.length !== syncResult.candidateCount ||
      !Array.isArray(evidence.telemetry.evidenceFingerprints)
    ) {
      return fail("IONOS_COMPOSITION_EVIDENCE_CARDINALITY_MISMATCH");
    }

    envelopes.push(...evidence.envelopes);
    mailboxResults.push({
      mailboxId: mailbox.id,
      role: mailbox.role,
      syncStatus: syncResult.status,
      candidateCount: syncResult.candidateCount,
      envelopeCount: evidence.envelopes.length,
      evidenceFingerprints: [...evidence.telemetry.evidenceFingerprints]
    });
  }

  assertDeadline(input.deadlineAtMs, now);
  let intelligence: IonosReadonlyIntelligencePipelineResultV1;
  try {
    intelligence = projectPipeline({
      ...input.pipeline,
      messages: envelopes
    });
  } catch {
    return fail("IONOS_COMPOSITION_PIPELINE_FAILURE");
  }

  return {
    intelligence,
    telemetry: {
      status: "COMPLETE",
      mailboxCount: mailboxes.length,
      candidateCount,
      envelopeCount: envelopes.length,
      mailboxResults
    }
  };
}

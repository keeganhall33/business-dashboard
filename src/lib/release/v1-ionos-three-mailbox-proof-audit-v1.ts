import { IONOS_MAILBOX_ROLES_V1, type IonosMailboxRoleV1 } from "@/lib/email/ionos-mailbox-config-v1";
import type { IonosHistoricalPreviewTelemetryV1 } from "@/lib/email/ionos-historical-intelligence-runner-v1";
import type {
  V1ReleaseActionRequirementV1,
  V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

export const V1_IONOS_THREE_MAILBOX_PROOF_AUDIT_VERSION_V1 =
  "V1_IONOS_THREE_MAILBOX_PROOF_AUDIT_V1" as const;

const SHA_40 = /^[0-9a-f]{40}$/;
const MAX_PROOF_AGE_MS = 24 * 60 * 60 * 1000;
const SAFE_EVIDENCE_REF = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~:/-]+$/i;
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|@|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

export type V1IonosThreeMailboxExecutionBoundsV1 = Readonly<{
  rangesBounded: boolean;
  batchSizesBounded: boolean;
  deadlineImmutable: boolean;
}>;

export type V1IonosThreeMailboxSafetyProofV1 = Readonly<{
  bodyPolicy: "NONE" | "OTHER" | "UNKNOWN";
  attachmentBytesRequested: number;
  mailboxMutationPerformed: boolean;
  incrementalCursorMutationPerformed: boolean;
  historicalCheckpointMutationPerformed: boolean;
  databaseMutationPerformed: boolean;
  repositoryMutationPerformed: boolean;
  smtpOrSendPerformed: boolean;
  cleanRepositoryBefore: boolean;
  cleanRepositoryAfter: boolean;
  privacySafeOutputConfirmed: boolean;
}>;

export type V1IonosThreeMailboxProofObservationV1 = Readonly<{
  releaseSha: string;
  observedAt: string;
  source: "LIVE_AUTHORIZED_LOCAL_RUNTIME" | "NON_LIVE" | "UNKNOWN";
  actionRequirement: V1ReleaseActionRequirementV1;
  telemetry: IonosHistoricalPreviewTelemetryV1;
  executionBounds: V1IonosThreeMailboxExecutionBoundsV1;
  safety: V1IonosThreeMailboxSafetyProofV1;
  evidenceRefs: readonly string[];
}>;

export type V1IonosThreeMailboxProofAuditInputV1 = Readonly<{
  releaseSha: string;
  generatedAt: string;
  maximumProofAgeMs: number;
  observations: readonly V1IonosThreeMailboxProofObservationV1[];
}>;

export type V1IonosThreeMailboxProofBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_GENERATED_AT"
  | "INVALID_MAXIMUM_PROOF_AGE"
  | "MISSING_LIVE_OBSERVATION"
  | "DUPLICATE_LIVE_OBSERVATION"
  | "NON_LIVE_SOURCE"
  | "OBSERVATION_SHA_MISMATCH"
  | "OBSERVATION_INVALID_TIMESTAMP"
  | "OBSERVATION_FUTURE_EVIDENCE"
  | "OBSERVATION_STALE"
  | "OBSERVATION_MISSING_PROVENANCE"
  | "OBSERVATION_UNSAFE_PROVENANCE"
  | "OBSERVATION_ACTION_REQUIRED"
  | "PREVIEW_NOT_COMPLETE"
  | "MAILBOX_COUNT_INVALID"
  | "MAILBOX_ROLE_SET_INVALID"
  | "MAILBOX_FAILED"
  | "MAILBOX_TELEMETRY_INVALID"
  | "AGGREGATE_TELEMETRY_INVALID"
  | "EXECUTION_BOUNDS_NOT_PROVEN"
  | "BODY_POLICY_NOT_NONE"
  | "ATTACHMENT_ACCESS_DETECTED"
  | "MAILBOX_MUTATION_DETECTED"
  | "CURSOR_MUTATION_DETECTED"
  | "CHECKPOINT_MUTATION_DETECTED"
  | "DATABASE_MUTATION_DETECTED"
  | "REPOSITORY_MUTATION_DETECTED"
  | "SMTP_OR_SEND_DETECTED"
  | "REPOSITORY_CLEANLINESS_NOT_PROVEN"
  | "PRIVACY_SAFE_OUTPUT_NOT_PROVEN";

export type V1IonosThreeMailboxProofBlockerV1 = Readonly<{
  code: V1IonosThreeMailboxProofBlockerCodeV1;
  detail: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
}>;

export type V1IonosThreeMailboxProofAuditResultV1 = Readonly<{
  contractVersion: typeof V1_IONOS_THREE_MAILBOX_PROOF_AUDIT_VERSION_V1;
  releaseSha: string;
  generatedAt: string;
  status: "PASS" | "BLOCKED";
  gateEvidence: V1ReleaseGateEvidenceV1;
  observedRoles: readonly IonosMailboxRoleV1[];
  aggregateCounts: Readonly<{
    candidateCount: number | null;
    envelopeCount: number | null;
    canonicalRecordCount: number | null;
    crmActivityCount: number | null;
    relationshipProjectionCount: number | null;
    inboxAttentionCount: number | null;
    verificationRequiredCount: number | null;
    rejectionCount: number | null;
  }>;
  blockers: readonly V1IonosThreeMailboxProofBlockerV1[];
  authority: Readonly<{
    canAccessMailbox: false;
    canMutateMailbox: false;
    canMutateCursor: false;
    canMutateDatabase: false;
    canSendEmail: false;
    canDeploy: false;
    canBypassApproval: false;
  }>;
}>;

const AUTHORITY = Object.freeze({
  canAccessMailbox: false as const,
  canMutateMailbox: false as const,
  canMutateCursor: false as const,
  canMutateDatabase: false as const,
  canSendEmail: false as const,
  canDeploy: false as const,
  canBypassApproval: false as const
});

function parsedTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function sanitizedEvidenceRefs(value: unknown): { refs: readonly string[]; unsafe: boolean } {
  if (!Array.isArray(value)) return { refs: [], unsafe: false };
  const normalized: string[] = [];
  let unsafe = false;
  for (const raw of value) {
    if (typeof raw !== "string") {
      unsafe = true;
      continue;
    }
    const ref = raw.trim();
    if (!ref || UNSAFE_EVIDENCE_REF.test(ref) || !SAFE_EVIDENCE_REF.test(ref)) {
      unsafe = true;
      continue;
    }
    normalized.push(ref);
  }
  if (unsafe) return { refs: [], unsafe: true };
  return { refs: Object.freeze([...new Set(normalized)].sort((a, b) => a.localeCompare(b))), unsafe: false };
}

function blocker(
  code: V1IonosThreeMailboxProofBlockerCodeV1,
  detail: string,
  evidenceRefs: readonly string[],
  actionRequirement: V1ReleaseActionRequirementV1
): V1IonosThreeMailboxProofBlockerV1 {
  return Object.freeze({ code, detail, evidenceRefs: Object.freeze([...evidenceRefs]), actionRequirement });
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function emptyCounts(): V1IonosThreeMailboxProofAuditResultV1["aggregateCounts"] {
  return Object.freeze({
    candidateCount: null,
    envelopeCount: null,
    canonicalRecordCount: null,
    crmActivityCount: null,
    relationshipProjectionCount: null,
    inboxAttentionCount: null,
    verificationRequiredCount: null,
    rejectionCount: null
  });
}

function countsFromTelemetry(
  telemetry: IonosHistoricalPreviewTelemetryV1 | undefined
): V1IonosThreeMailboxProofAuditResultV1["aggregateCounts"] {
  if (!telemetry) return emptyCounts();
  const values = {
    candidateCount: telemetry.candidateCount,
    envelopeCount: telemetry.envelopeCount,
    canonicalRecordCount: telemetry.canonicalRecordCount,
    crmActivityCount: telemetry.crmActivityCount,
    relationshipProjectionCount: telemetry.relationshipProjectionCount,
    inboxAttentionCount: telemetry.inboxAttentionCount,
    verificationRequiredCount: telemetry.verificationRequiredCount,
    rejectionCount: telemetry.rejectionCount
  };
  if (!Object.values(values).every(validCount)) return emptyCounts();
  return Object.freeze(values);
}

function roleSetIsExact(telemetry: IonosHistoricalPreviewTelemetryV1): boolean {
  if (!Array.isArray(telemetry.mailboxes) || telemetry.mailboxes.length !== IONOS_MAILBOX_ROLES_V1.length) {
    return false;
  }
  const roles = telemetry.mailboxes.map((mailbox) => mailbox.role);
  return IONOS_MAILBOX_ROLES_V1.every((role) => roles.filter((candidate) => candidate === role).length === 1);
}

function telemetryCountsAreConsistent(telemetry: IonosHistoricalPreviewTelemetryV1): boolean {
  const aggregateValues = [
    telemetry.successfulMailboxCount,
    telemetry.failedMailboxCount,
    telemetry.candidateCount,
    telemetry.envelopeCount,
    telemetry.canonicalRecordCount,
    telemetry.crmActivityCount,
    telemetry.relationshipProjectionCount,
    telemetry.inboxAttentionCount,
    telemetry.verificationRequiredCount,
    telemetry.rejectionCount
  ];
  if (!aggregateValues.every(validCount)) return false;
  if (!Array.isArray(telemetry.mailboxes)) return false;
  if (telemetry.mailboxes.some((mailbox) => ![
    mailbox.fetchedCount,
    mailbox.candidateCount,
    mailbox.envelopeCount
  ].every(validCount))) return false;
  const candidateTotal = telemetry.mailboxes.reduce((total, mailbox) => total + mailbox.candidateCount, 0);
  const envelopeTotal = telemetry.mailboxes.reduce((total, mailbox) => total + mailbox.envelopeCount, 0);
  return candidateTotal === telemetry.candidateCount && envelopeTotal === telemetry.envelopeCount;
}

/**
 * Compiles already-observed, privacy-safe live IONOS preview evidence into the canonical
 * Useful V1 IONOS_THREE_MAILBOX_PROOF release gate.
 *
 * This compiler does not access IONOS, 1Password, a mailbox, a cursor, a database, the
 * repository worktree, or production. It cannot execute the live proof. Missing, stale,
 * partial, unsafe, or mutation-bearing evidence remains blocking instead of being promoted
 * to release truth.
 */
export function compileV1IonosThreeMailboxProofAuditV1(
  input: V1IonosThreeMailboxProofAuditInputV1
): V1IonosThreeMailboxProofAuditResultV1 {
  const blockers: V1IonosThreeMailboxProofBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input?.releaseSha ?? "");
  const generatedAtMs = parsedTimestamp(input?.generatedAt);
  const maximumProofAgeMs = input?.maximumProofAgeMs;
  const maximumAgeValid = typeof maximumProofAgeMs === "number"
    && Number.isSafeInteger(maximumProofAgeMs)
    && maximumProofAgeMs > 0
    && maximumProofAgeMs <= MAX_PROOF_AGE_MS;

  if (!releaseShaValid) {
    blockers.push(blocker(
      "INVALID_RELEASE_SHA",
      "IONOS release proof requires an exact lowercase 40-character Git commit SHA.",
      [],
      "UNKNOWN"
    ));
  }
  if (generatedAtMs == null) {
    blockers.push(blocker(
      "INVALID_GENERATED_AT",
      "IONOS release proof generatedAt must be a valid timestamp.",
      [],
      "UNKNOWN"
    ));
  }
  if (!maximumAgeValid) {
    blockers.push(blocker(
      "INVALID_MAXIMUM_PROOF_AGE",
      "maximumProofAgeMs must be an explicit positive safe integer no greater than 24 hours.",
      [],
      "UNKNOWN"
    ));
  }

  const observations = Array.isArray(input?.observations) ? input.observations : [];
  if (observations.length === 0) {
    blockers.push(blocker(
      "MISSING_LIVE_OBSERVATION",
      "Exactly one current live authorized three-mailbox preview observation is required.",
      [],
      "UNKNOWN"
    ));
  } else if (observations.length > 1) {
    const duplicateEvidence = sanitizedEvidenceRefs(observations.flatMap((entry) => entry?.evidenceRefs ?? []));
    blockers.push(blocker(
      "DUPLICATE_LIVE_OBSERVATION",
      "Multiple live proof observations were supplied; the compiler refuses to choose a winner.",
      duplicateEvidence.refs,
      observations.some((entry) => entry.actionRequirement === "KEEGAN") ? "KEEGAN" : "UNKNOWN"
    ));
    if (duplicateEvidence.unsafe) {
      blockers.push(blocker(
        "OBSERVATION_UNSAFE_PROVENANCE",
        "Evidence references contain unsafe or non-redacted material and were removed from output.",
        [],
        "UNKNOWN"
      ));
    }
  }

  const observation = observations.length === 1 ? observations[0] : undefined;
  const evidence = sanitizedEvidenceRefs(observation?.evidenceRefs);
  const actionRequirement = observation?.actionRequirement ?? "UNKNOWN";
  const telemetry = observation?.telemetry;
  const observedAtMs = parsedTimestamp(observation?.observedAt);

  if (observation) {
    if (observation.source !== "LIVE_AUTHORIZED_LOCAL_RUNTIME") {
      blockers.push(blocker(
        "NON_LIVE_SOURCE",
        "Fixture, simulated, unknown, or non-authorized runtime evidence cannot satisfy the live IONOS gate.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (!releaseShaValid || observation.releaseSha !== input.releaseSha) {
      blockers.push(blocker(
        "OBSERVATION_SHA_MISMATCH",
        "The live IONOS observation is not bound to the exact release SHA.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observedAtMs == null) {
      blockers.push(blocker(
        "OBSERVATION_INVALID_TIMESTAMP",
        "The live IONOS observation timestamp is invalid.",
        evidence.refs,
        actionRequirement
      ));
    } else if (generatedAtMs != null && observedAtMs > generatedAtMs) {
      blockers.push(blocker(
        "OBSERVATION_FUTURE_EVIDENCE",
        "The live IONOS observation is dated after proof artifact generation.",
        evidence.refs,
        actionRequirement
      ));
    } else if (generatedAtMs != null && maximumAgeValid && generatedAtMs - observedAtMs > maximumProofAgeMs) {
      blockers.push(blocker(
        "OBSERVATION_STALE",
        "The live IONOS observation exceeds the caller-owned freshness limit.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (evidence.refs.length === 0) {
      blockers.push(blocker(
        "OBSERVATION_MISSING_PROVENANCE",
        "The live IONOS proof requires at least one privacy-safe evidence reference.",
        [],
        actionRequirement
      ));
    }
    if (evidence.unsafe) {
      blockers.push(blocker(
        "OBSERVATION_UNSAFE_PROVENANCE",
        "Evidence references contain unsafe, private, secret-like, or non-redacted material and were removed from output.",
        [],
        actionRequirement
      ));
    }
    if (actionRequirement !== "NONE") {
      blockers.push(blocker(
        "OBSERVATION_ACTION_REQUIRED",
        "The IONOS proof cannot pass while an unresolved action requirement remains.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (!telemetry || telemetry.status !== "COMPLETE") {
      blockers.push(blocker(
        "PREVIEW_NOT_COMPLETE",
        "Only a COMPLETE live historical preview can satisfy the three-mailbox proof gate.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (!telemetry || telemetry.mailboxCount !== 3 || telemetry.successfulMailboxCount !== 3 || telemetry.failedMailboxCount !== 0) {
      blockers.push(blocker(
        "MAILBOX_COUNT_INVALID",
        "The proof must show exactly three successful mailboxes and zero failed mailboxes.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (telemetry && !roleSetIsExact(telemetry)) {
      blockers.push(blocker(
        "MAILBOX_ROLE_SET_INVALID",
        "The proof must contain each canonical IONOS mailbox role exactly once.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (telemetry && Array.isArray(telemetry.mailboxes) && telemetry.mailboxes.some((mailbox) =>
      mailbox.status === "FAILED" || mailbox.reason !== null
    )) {
      blockers.push(blocker(
        "MAILBOX_FAILED",
        "A mailbox reported failure or a non-null failure reason.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (telemetry && Array.isArray(telemetry.mailboxes) && telemetry.mailboxes.some((mailbox) =>
      (mailbox.status !== "SCANNED" && mailbox.status !== "NO_MESSAGES")
      || (mailbox.status === "NO_MESSAGES" && (mailbox.candidateCount !== 0 || mailbox.envelopeCount !== 0))
    )) {
      blockers.push(blocker(
        "MAILBOX_TELEMETRY_INVALID",
        "Successful mailbox telemetry is internally inconsistent.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (telemetry && !telemetryCountsAreConsistent(telemetry)) {
      blockers.push(blocker(
        "AGGREGATE_TELEMETRY_INVALID",
        "Live preview aggregate counts must be non-negative safe integers and reconcile to mailbox totals.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (!observation.executionBounds?.rangesBounded
      || !observation.executionBounds?.batchSizesBounded
      || !observation.executionBounds?.deadlineImmutable) {
      blockers.push(blocker(
        "EXECUTION_BOUNDS_NOT_PROVEN",
        "The live proof must explicitly prove bounded ranges, bounded batch sizes, and an immutable total deadline.",
        evidence.refs,
        actionRequirement
      ));
    }

    if (observation.safety?.bodyPolicy !== "NONE") {
      blockers.push(blocker(
        "BODY_POLICY_NOT_NONE",
        "Historical proof body policy must remain NONE.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (!validCount(observation.safety?.attachmentBytesRequested) || observation.safety.attachmentBytesRequested !== 0) {
      blockers.push(blocker(
        "ATTACHMENT_ACCESS_DETECTED",
        "Historical proof must request zero attachment bytes.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.mailboxMutationPerformed !== false) {
      blockers.push(blocker(
        "MAILBOX_MUTATION_DETECTED",
        "Mailbox flags, folders, and messages must remain unmodified.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.incrementalCursorMutationPerformed !== false) {
      blockers.push(blocker(
        "CURSOR_MUTATION_DETECTED",
        "The live historical proof must not mutate the incremental cursor.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.historicalCheckpointMutationPerformed !== false) {
      blockers.push(blocker(
        "CHECKPOINT_MUTATION_DETECTED",
        "The live historical proof must not mutate a historical checkpoint.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.databaseMutationPerformed !== false) {
      blockers.push(blocker(
        "DATABASE_MUTATION_DETECTED",
        "The live historical proof must not mutate the database.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.repositoryMutationPerformed !== false) {
      blockers.push(blocker(
        "REPOSITORY_MUTATION_DETECTED",
        "The live historical proof must not mutate the repository.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.smtpOrSendPerformed !== false) {
      blockers.push(blocker(
        "SMTP_OR_SEND_DETECTED",
        "SMTP and send activity must remain disabled during proof collection.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.cleanRepositoryBefore !== true || observation.safety?.cleanRepositoryAfter !== true) {
      blockers.push(blocker(
        "REPOSITORY_CLEANLINESS_NOT_PROVEN",
        "Repository cleanliness must be explicitly proven before and after the live proof.",
        evidence.refs,
        actionRequirement
      ));
    }
    if (observation.safety?.privacySafeOutputConfirmed !== true) {
      blockers.push(blocker(
        "PRIVACY_SAFE_OUTPUT_NOT_PROVEN",
        "The live proof output must be explicitly confirmed privacy-safe before certification.",
        evidence.refs,
        actionRequirement
      ));
    }
  }

  const pass = blockers.length === 0 && observation != null;
  const observedRoles = telemetry && roleSetIsExact(telemetry)
    ? Object.freeze([...IONOS_MAILBOX_ROLES_V1])
    : Object.freeze([] as IonosMailboxRoleV1[]);
  const aggregateCounts = countsFromTelemetry(telemetry);
  const gateObservedAt = observation && observedAtMs != null
    ? new Date(observedAtMs).toISOString()
    : input.generatedAt;

  const result: V1IonosThreeMailboxProofAuditResultV1 = {
    contractVersion: V1_IONOS_THREE_MAILBOX_PROOF_AUDIT_VERSION_V1,
    releaseSha: input.releaseSha,
    generatedAt: input.generatedAt,
    status: pass ? "PASS" : "BLOCKED",
    gateEvidence: {
      gateId: "IONOS_THREE_MAILBOX_PROOF",
      state: pass ? "PASS" : "BLOCKED",
      freshness: pass ? "CURRENT" : "UNKNOWN",
      observedAt: gateObservedAt,
      evidenceRefs: pass ? evidence.refs : evidence.refs,
      releaseSha: pass ? input.releaseSha : null,
      actionRequirement: pass ? "NONE" : actionRequirement,
      detail: pass
        ? "One current, exact-SHA, privacy-safe live preview proved all three authorized IONOS mailbox roles under read-only safety boundaries."
        : "IONOS three-mailbox release proof remains blocked until every live evidence and safety invariant passes."
    },
    observedRoles,
    aggregateCounts,
    blockers: Object.freeze([...blockers]),
    authority: AUTHORITY
  };

  return freezeDeep(result);
}

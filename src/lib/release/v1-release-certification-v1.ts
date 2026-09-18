export const V1_RELEASE_GATE_IDS = [
  "VALIDATED_MAIN",
  "PRODUCTION_SMOKE",
  "EXECUTIVE_HOME_TRUTH",
  "IONOS_THREE_MAILBOX_PROOF"
] as const;

export type V1ReleaseGateId = (typeof V1_RELEASE_GATE_IDS)[number];
export type V1ReleaseTruthState = "KNOWN" | "UNKNOWN" | "CONFLICTED";

export type V1ReleaseGateEvidenceV1 = {
  truthState: V1ReleaseTruthState;
  outcome: "PASS" | "FAIL" | null;
  commitSha: string | null;
  observedAt: string | null;
  evidenceRefs?: readonly string[];
};

export type V1IonosMailboxProofV1 = {
  mailboxRole: string;
  authenticatedReadOnly: true;
};

export type V1IonosHistoricalProofV1 = V1ReleaseGateEvidenceV1 & {
  mailboxes: readonly V1IonosMailboxProofV1[];
  failedMailboxCount: number | null;
  boundedRanges: boolean | null;
  boundedBatchSizes: boolean | null;
  immutableDeadline: boolean | null;
  bodyPolicy: "NONE" | null;
  attachmentBytesRequested: number | null;
  mailboxMutationCount: number | null;
  cursorMutationCount: number | null;
  databaseMutationCount: number | null;
  smtpSendCount: number | null;
  repositoryCleanBefore: boolean | null;
  repositoryCleanAfter: boolean | null;
  projectionCounts: {
    canonical: number | null;
    crmActivity: number | null;
    relationship: number | null;
    intelligentInbox: number | null;
    verificationRequired: number | null;
    rejection: number | null;
  };
};

export type V1ReleaseCertificationInputV1 = {
  releaseCommitSha: string;
  validation: V1ReleaseGateEvidenceV1;
  productionSmoke: V1ReleaseGateEvidenceV1;
  executiveHomeTruth: V1ReleaseGateEvidenceV1;
  ionosHistoricalProof: V1IonosHistoricalProofV1;
};

export type V1ReleaseGateResultV1 = {
  gateId: V1ReleaseGateId;
  state: "PASSED" | "BLOCKED";
  reasons: readonly string[];
  evidenceRefs: readonly string[];
};

export type V1ReleaseCertificationV1 = {
  contractVersion: "V1ReleaseCertificationV1";
  releaseCommitSha: string;
  certifiedAt: string;
  state: "RELEASE_READY" | "BLOCKED";
  gates: readonly V1ReleaseGateResultV1[];
  blockedReasons: readonly string[];
  evidenceRefs: readonly string[];
  liveIonosProofRequired: true;
  exactCommitEvidenceRequired: true;
  productionTruthClaimedOnlyWhenAllGatesPass: true;
  externalAccessPerformed: false;
  writesPerformed: false;
  causalityClaimed: false;
  monetaryOutcomeClaimed: false;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const MAX_REFERENCE_LENGTH = 2_000;
const MAX_ROLE_LENGTH = 100;
const MAX_REFERENCES_PER_GATE = 100;

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "address",
  "email",
  "subject",
  "messageid",
  "body",
  "attachment",
  "credential",
  "credentials",
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "authorization",
  "authorizationheader",
  "cookie",
  "providererror",
  "canonicalid",
  "opreference"
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeSha(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) throw new Error(`${field} must be a full 40-character git commit SHA`);
  return normalized;
}

function normalizeIso(value: string | null, field: string, nowMs: number): string | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be null or a valid timestamp`);
  if (parsed > nowMs) throw new Error(`${field} cannot be in the future`);
  return new Date(parsed).toISOString();
}

function rejectSensitiveMaterial(value: unknown, path = "input", seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSensitiveMaterial(child, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, child] of Object.entries(object)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (FORBIDDEN_EVIDENCE_KEYS.has(normalizedKey)) {
      throw new Error(`${path}.${key} is forbidden in release certification evidence`);
    }
    rejectSensitiveMaterial(child, `${path}.${key}`, seen);
  }
}

function safeReference(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > MAX_REFERENCE_LENGTH) throw new Error(`${field} exceeds ${MAX_REFERENCE_LENGTH} characters`);
  if (/^op:\/\//i.test(normalized)) throw new Error(`${field} must not contain op:// references`);
  if (/^bearer\s+/i.test(normalized)) throw new Error(`${field} must not contain bearer credentials`);
  if (/(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
    throw new Error(`${field} must not contain credential material`);
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) throw new Error(`${field} must not contain embedded credentials`);
    for (const key of ["access_token", "token", "api_key", "apikey", "signature", "secret"]) {
      if (parsed.searchParams.has(key)) throw new Error(`${field} must not contain credential query parameters`);
    }
  } catch (error) {
    if (error instanceof Error && /credential/.test(error.message)) throw error;
  }
  return normalized;
}

function normalizeRefs(values: readonly string[] | undefined, field: string): string[] {
  const refs = [...new Set((values ?? []).map((value, index) => safeReference(value, `${field}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (refs.length > MAX_REFERENCES_PER_GATE) throw new Error(`${field} exceeds ${MAX_REFERENCES_PER_GATE} references`);
  return refs;
}

function evidenceReasons(
  gateName: string,
  evidence: V1ReleaseGateEvidenceV1,
  releaseCommitSha: string,
  nowMs: number
): { reasons: string[]; evidenceRefs: string[] } {
  const reasons: string[] = [];
  const evidenceRefs = normalizeRefs(evidence.evidenceRefs, `${gateName}.evidenceRefs`);
  const observedAt = normalizeIso(evidence.observedAt, `${gateName}.observedAt`, nowMs);

  if (evidence.truthState !== "KNOWN") reasons.push(`${gateName} evidence truth is ${evidence.truthState}`);
  if (evidence.outcome !== "PASS") reasons.push(`${gateName} outcome is not PASS`);
  if (!evidence.commitSha) {
    reasons.push(`${gateName} is missing commit evidence`);
  } else if (normalizeSha(evidence.commitSha, `${gateName}.commitSha`) !== releaseCommitSha) {
    reasons.push(`${gateName} was not proven on the exact release commit`);
  }
  if (!observedAt) reasons.push(`${gateName} is missing observation time`);
  if (evidenceRefs.length === 0) reasons.push(`${gateName} is missing evidence references`);

  return { reasons, evidenceRefs };
}

function requireNonNegativeInteger(value: number | null, field: string, reasons: string[]): void {
  if (value === null || !Number.isSafeInteger(value) || value < 0) reasons.push(`${field} must be a known non-negative integer`);
}

function ionosReasons(
  evidence: V1IonosHistoricalProofV1,
  releaseCommitSha: string,
  nowMs: number
): { reasons: string[]; evidenceRefs: string[] } {
  const base = evidenceReasons("IONOS_THREE_MAILBOX_PROOF", evidence, releaseCommitSha, nowMs);
  const reasons = [...base.reasons];

  if (!Array.isArray(evidence.mailboxes) || evidence.mailboxes.length !== 3) {
    reasons.push("IONOS_THREE_MAILBOX_PROOF must contain exactly three mailbox roles");
  } else {
    const roles = evidence.mailboxes.map((mailbox, index) => {
      const role = mailbox.mailboxRole.trim();
      if (!role || role.length > MAX_ROLE_LENGTH) reasons.push(`mailboxes[${index}].mailboxRole must be a bounded opaque role`);
      if (role.includes("@") || /\s/.test(role)) reasons.push(`mailboxes[${index}].mailboxRole must not expose an address or free-form mailbox identity`);
      if (mailbox.authenticatedReadOnly !== true) reasons.push(`mailboxes[${index}] was not proven authenticated read-only`);
      return role.toLowerCase();
    });
    if (new Set(roles).size !== 3) reasons.push("IONOS_THREE_MAILBOX_PROOF mailbox roles must be unique");
  }

  if (evidence.failedMailboxCount !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires failedMailboxCount=0");
  if (evidence.boundedRanges !== true) reasons.push("IONOS_THREE_MAILBOX_PROOF requires bounded ranges");
  if (evidence.boundedBatchSizes !== true) reasons.push("IONOS_THREE_MAILBOX_PROOF requires bounded batch sizes");
  if (evidence.immutableDeadline !== true) reasons.push("IONOS_THREE_MAILBOX_PROOF requires an immutable total deadline");
  if (evidence.bodyPolicy !== "NONE") reasons.push("IONOS_THREE_MAILBOX_PROOF requires bodyPolicy=NONE");
  if (evidence.attachmentBytesRequested !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires zero attachment bytes requested");
  if (evidence.mailboxMutationCount !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires zero mailbox mutation");
  if (evidence.cursorMutationCount !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires zero cursor/checkpoint mutation");
  if (evidence.databaseMutationCount !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires zero database mutation");
  if (evidence.smtpSendCount !== 0) reasons.push("IONOS_THREE_MAILBOX_PROOF requires zero SMTP/send activity");
  if (evidence.repositoryCleanBefore !== true) reasons.push("IONOS_THREE_MAILBOX_PROOF requires a clean repository before execution");
  if (evidence.repositoryCleanAfter !== true) reasons.push("IONOS_THREE_MAILBOX_PROOF requires a clean repository after execution");

  for (const [key, value] of Object.entries(evidence.projectionCounts)) {
    requireNonNegativeInteger(value, `IONOS_THREE_MAILBOX_PROOF.projectionCounts.${key}`, reasons);
  }

  return { reasons, evidenceRefs: base.evidenceRefs };
}

function gateResult(gateId: V1ReleaseGateId, reasons: string[], evidenceRefs: string[]): V1ReleaseGateResultV1 {
  return {
    gateId,
    state: reasons.length === 0 ? "PASSED" : "BLOCKED",
    reasons: [...new Set(reasons)],
    evidenceRefs
  };
}

export function compileV1ReleaseCertificationV1(
  input: V1ReleaseCertificationInputV1,
  now: string
): V1ReleaseCertificationV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  rejectSensitiveMaterial(input);

  const nowMs = Date.parse(now);
  if (!now || Number.isNaN(nowMs)) throw new Error("now must be a valid timestamp");
  const certifiedAt = new Date(nowMs).toISOString();
  const releaseCommitSha = normalizeSha(input.releaseCommitSha, "releaseCommitSha");

  const validation = evidenceReasons("VALIDATED_MAIN", input.validation, releaseCommitSha, nowMs);
  const productionSmoke = evidenceReasons("PRODUCTION_SMOKE", input.productionSmoke, releaseCommitSha, nowMs);
  const executiveHomeTruth = evidenceReasons("EXECUTIVE_HOME_TRUTH", input.executiveHomeTruth, releaseCommitSha, nowMs);
  const ionos = ionosReasons(input.ionosHistoricalProof, releaseCommitSha, nowMs);

  const gates = [
    gateResult("VALIDATED_MAIN", validation.reasons, validation.evidenceRefs),
    gateResult("PRODUCTION_SMOKE", productionSmoke.reasons, productionSmoke.evidenceRefs),
    gateResult("EXECUTIVE_HOME_TRUTH", executiveHomeTruth.reasons, executiveHomeTruth.evidenceRefs),
    gateResult("IONOS_THREE_MAILBOX_PROOF", ionos.reasons, ionos.evidenceRefs)
  ] as const;
  const blockedReasons = gates.flatMap((gate) => gate.reasons.map((reason) => `${gate.gateId}: ${reason}`));
  const evidenceRefs = [...new Set(gates.flatMap((gate) => gate.evidenceRefs))].sort((a, b) => a.localeCompare(b));

  return freeze({
    contractVersion: "V1ReleaseCertificationV1",
    releaseCommitSha,
    certifiedAt,
    state: blockedReasons.length === 0 ? "RELEASE_READY" : "BLOCKED",
    gates,
    blockedReasons,
    evidenceRefs,
    liveIonosProofRequired: true,
    exactCommitEvidenceRequired: true,
    productionTruthClaimedOnlyWhenAllGatesPass: true,
    externalAccessPerformed: false,
    writesPerformed: false,
    causalityClaimed: false,
    monetaryOutcomeClaimed: false
  });
}

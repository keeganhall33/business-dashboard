import type {
  V1ReleaseActionRequirementV1,
  V1ReleaseFreshnessV1,
  V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

export const V1_CRM_REQUIRED_READS_V1 = [
  "PEOPLE_DIRECTORY",
  "COMPANIES_DIRECTORY",
  "ACTIVITY_TIMELINE"
] as const;

export type V1CrmRequiredReadIdV1 = (typeof V1_CRM_REQUIRED_READS_V1)[number];
export type V1CrmReadStateV1 =
  | "READ_SUCCEEDED"
  | "EMPTY_CONFIRMED"
  | "PARTIAL"
  | "FAILED"
  | "UNKNOWN"
  | "CONFLICTED";

export type V1CrmDirectoryReadObservationV1 = {
  readId: V1CrmRequiredReadIdV1;
  state: V1CrmReadStateV1;
  releaseSha: string;
  observedAt: string;
  source: "CANONICAL_PERSISTED_CRM";
  accessMode: "READ_ONLY";
  fixtureUsed: boolean;
  mutationAttempted: boolean;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1CrmDirectoryReadAuditInputV1 = {
  releaseSha: string;
  evaluatedAt: string;
  maxEvidenceAgeMs: number;
  observations: readonly V1CrmDirectoryReadObservationV1[];
};

export type V1CrmDirectoryReadBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_EVALUATED_AT"
  | "INVALID_FRESHNESS_POLICY"
  | "MISSING_REQUIRED_READ"
  | "DUPLICATE_REQUIRED_READ"
  | "READ_SHA_MISMATCH"
  | "READ_INVALID_TIMESTAMP"
  | "READ_FUTURE_EVIDENCE"
  | "READ_STALE_EVIDENCE"
  | "READ_MISSING_PROVENANCE"
  | "READ_UNSAFE_PROVENANCE"
  | "READ_NOT_COMPLETE"
  | "FIXTURE_USED"
  | "MUTATION_ATTEMPTED";

export type V1CrmDirectoryReadBlockerV1 = {
  code: V1CrmDirectoryReadBlockerCodeV1;
  readId: V1CrmRequiredReadIdV1 | null;
  detail: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1CrmDirectoryReadAuditV1 = {
  contractVersion: "V1_CRM_DIRECTORY_READ_AUDIT_V1";
  evaluatedAt: string;
  releaseSha: string;
  gateEvidence: V1ReleaseGateEvidenceV1;
  blockers: readonly V1CrmDirectoryReadBlockerV1[];
  authority: {
    canMutateCrm: false;
    canCreateIdentity: false;
    canInferRelationship: false;
    canMerge: false;
    canDeploy: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRefs(refs: readonly string[]): { refs: string[]; unsafe: boolean } {
  const cleaned = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
  const unsafe = cleaned.some((ref) => UNSAFE_EVIDENCE_REF.test(ref));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function blocker(
  code: V1CrmDirectoryReadBlockerCodeV1,
  detail: string,
  readId: V1CrmRequiredReadIdV1 | null = null,
  evidenceRefs: readonly string[] = [],
  actionRequirement: V1ReleaseActionRequirementV1 = "UNKNOWN"
): V1CrmDirectoryReadBlockerV1 {
  return { code, readId, detail, evidenceRefs: [...evidenceRefs], actionRequirement };
}

function aggregateAction(
  blockers: readonly V1CrmDirectoryReadBlockerV1[]
): V1ReleaseActionRequirementV1 {
  if (blockers.some((entry) => entry.actionRequirement === "KEEGAN")) return "KEEGAN";
  if (blockers.length === 0) return "NONE";
  if (blockers.every((entry) => entry.actionRequirement === "NONE")) return "NONE";
  return "UNKNOWN";
}

function freshness(
  blockers: readonly V1CrmDirectoryReadBlockerV1[]
): V1ReleaseFreshnessV1 {
  if (blockers.some((entry) => entry.code === "READ_STALE_EVIDENCE")) return "STALE";
  if (
    blockers.some((entry) =>
      [
        "INVALID_EVALUATED_AT",
        "INVALID_FRESHNESS_POLICY",
        "MISSING_REQUIRED_READ",
        "DUPLICATE_REQUIRED_READ",
        "READ_INVALID_TIMESTAMP",
        "READ_FUTURE_EVIDENCE",
        "READ_MISSING_PROVENANCE",
        "READ_UNSAFE_PROVENANCE"
      ].includes(entry.code)
    )
  ) {
    return "UNKNOWN";
  }
  return "CURRENT";
}

/**
 * Compiles explicit release evidence for the Useful V1 CRM directory-read gate.
 * It does not query CRM, create identities, infer relationships, reinterpret partial
 * reads, or authorize any write. EMPTY_CONFIRMED proves only that the canonical read
 * completed and explicitly returned no records; it does not manufacture content.
 */
export function compileV1CrmDirectoryReadAuditV1(
  input: V1CrmDirectoryReadAuditInputV1
): V1CrmDirectoryReadAuditV1 {
  const blockers: V1CrmDirectoryReadBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const evaluatedAtMs = timestamp(input.evaluatedAt);
  const freshnessPolicyValid =
    Number.isFinite(input.maxEvidenceAgeMs) && input.maxEvidenceAgeMs > 0;

  if (!releaseShaValid) {
    blockers.push(
      blocker(
        "INVALID_RELEASE_SHA",
        "CRM read audit requires an exact lowercase 40-character release SHA."
      )
    );
  }
  if (evaluatedAtMs == null) {
    blockers.push(
      blocker("INVALID_EVALUATED_AT", "CRM read audit evaluatedAt must be a valid timestamp.")
    );
  }
  if (!freshnessPolicyValid) {
    blockers.push(
      blocker(
        "INVALID_FRESHNESS_POLICY",
        "CRM read audit requires an explicit positive finite maxEvidenceAgeMs policy."
      )
    );
  }

  const groups = new Map<V1CrmRequiredReadIdV1, V1CrmDirectoryReadObservationV1[]>();
  for (const observation of input.observations) {
    const entries = groups.get(observation.readId) ?? [];
    entries.push(observation);
    groups.set(observation.readId, entries);
  }

  for (const readId of V1_CRM_REQUIRED_READS_V1) {
    const observations = groups.get(readId) ?? [];
    if (observations.length === 0) {
      blockers.push(
        blocker(
          "MISSING_REQUIRED_READ",
          `${readId} has no explicit current canonical read observation.`,
          readId
        )
      );
      continue;
    }
    if (observations.length > 1) {
      const refs = sanitizeRefs(observations.flatMap((entry) => entry.evidenceRefs));
      blockers.push(
        blocker(
          "DUPLICATE_REQUIRED_READ",
          `${readId} has multiple observations; the audit refuses to choose a convenient result.`,
          readId,
          refs.refs
        )
      );
      continue;
    }

    const observation = observations[0];
    const refs = sanitizeRefs(observation.evidenceRefs);
    const observedAtMs = timestamp(observation.observedAt);

    if (!releaseShaValid || observation.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "READ_SHA_MISMATCH",
          `${readId} is not bound to the exact audited release SHA.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    }
    if (observedAtMs == null) {
      blockers.push(
        blocker(
          "READ_INVALID_TIMESTAMP",
          `${readId} has an invalid observedAt timestamp.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    } else if (evaluatedAtMs != null && observedAtMs > evaluatedAtMs) {
      blockers.push(
        blocker(
          "READ_FUTURE_EVIDENCE",
          `${readId} evidence is dated after the audit evaluation time.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    } else if (
      evaluatedAtMs != null &&
      freshnessPolicyValid &&
      evaluatedAtMs - observedAtMs > input.maxEvidenceAgeMs
    ) {
      blockers.push(
        blocker(
          "READ_STALE_EVIDENCE",
          `${readId} evidence is older than the caller-owned freshness policy.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    }

    if (refs.refs.length === 0 && !refs.unsafe) {
      blockers.push(
        blocker(
          "READ_MISSING_PROVENANCE",
          `${readId} requires provenance proving the canonical persisted read.`,
          readId,
          [],
          observation.actionRequirement
        )
      );
    }
    if (refs.unsafe) {
      blockers.push(
        blocker(
          "READ_UNSAFE_PROVENANCE",
          `${readId} contains secret/reference material that cannot enter release evidence.`,
          readId,
          [],
          observation.actionRequirement
        )
      );
    }
    if (observation.fixtureUsed) {
      blockers.push(
        blocker(
          "FIXTURE_USED",
          `${readId} used fixture data and cannot certify a production CRM read.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    }
    if (observation.mutationAttempted) {
      blockers.push(
        blocker(
          "MUTATION_ATTEMPTED",
          `${readId} attempted mutation; the release gate accepts read-only proof only.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    }
    if (!['READ_SUCCEEDED', 'EMPTY_CONFIRMED'].includes(observation.state)) {
      blockers.push(
        blocker(
          "READ_NOT_COMPLETE",
          `${readId} is ${observation.state}; only an explicit complete canonical read can pass.`,
          readId,
          refs.refs,
          observation.actionRequirement
        )
      );
    }
  }

  const allRefs = sanitizeRefs(input.observations.flatMap((entry) => entry.evidenceRefs));

  return {
    contractVersion: "V1_CRM_DIRECTORY_READ_AUDIT_V1",
    evaluatedAt: input.evaluatedAt,
    releaseSha: input.releaseSha,
    gateEvidence: {
      gateId: "CRM_DIRECTORY_READS",
      state: blockers.length === 0 ? "PASS" : "BLOCKED",
      freshness: freshness(blockers),
      observedAt: input.evaluatedAt,
      evidenceRefs: allRefs.unsafe ? [] : allRefs.refs,
      releaseSha: releaseShaValid ? input.releaseSha : null,
      actionRequirement: aggregateAction(blockers),
      detail:
        blockers.length === 0
          ? "People, Companies, and Activity completed canonical persisted read-only CRM reads without fixture truth."
          : `${blockers.length} CRM directory-read audit blocker(s) require resolution or fresh evidence.`
    },
    blockers,
    authority: {
      canMutateCrm: false,
      canCreateIdentity: false,
      canInferRelationship: false,
      canMerge: false,
      canDeploy: false,
      canBypassApproval: false
    }
  };
}

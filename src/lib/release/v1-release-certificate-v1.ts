export const V1_RELEASE_REQUIRED_GATES_V1 = [
  "INTEGRATED_CODE",
  "PRODUCTION_PROPAGATION",
  "PRODUCTION_SMOKE",
  "EXECUTIVE_HOME_TRUTH",
  "CRM_DIRECTORY_READS",
  "RELEASE_REVIEW_AUDIT",
  "P0_CORRECTNESS_SECURITY",
  "IONOS_THREE_MAILBOX_PROOF"
] as const;

export type V1ReleaseGateIdV1 = (typeof V1_RELEASE_REQUIRED_GATES_V1)[number];

export type V1ReleaseGateStateV1 =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "UNKNOWN"
  | "CONFLICTED";

export type V1ReleaseFreshnessV1 = "CURRENT" | "STALE" | "UNKNOWN";
export type V1ReleaseActionRequirementV1 = "NONE" | "KEEGAN" | "UNKNOWN";
export type V1FinalAcceptanceStateV1 = "PENDING" | "ACCEPTED" | "REJECTED" | "UNKNOWN";

export type V1ReleaseGateEvidenceV1 = {
  gateId: V1ReleaseGateIdV1;
  state: V1ReleaseGateStateV1;
  freshness: V1ReleaseFreshnessV1;
  observedAt: string;
  evidenceRefs: readonly string[];
  releaseSha: string | null;
  actionRequirement: V1ReleaseActionRequirementV1;
  detail?: string | null;
};

export type V1FinalAcceptanceEvidenceV1 = {
  state: V1FinalAcceptanceStateV1;
  observedAt?: string | null;
  evidenceRefs?: readonly string[];
};

export type V1ReleaseCertificationInputV1 = {
  releaseSha: string;
  generatedAt: string;
  gates: readonly V1ReleaseGateEvidenceV1[];
  finalAcceptance: V1FinalAcceptanceEvidenceV1;
};

export type V1ReleaseBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_GENERATED_AT"
  | "MISSING_GATE"
  | "DUPLICATE_GATE"
  | "GATE_NOT_PASS"
  | "GATE_NOT_CURRENT"
  | "GATE_SHA_MISMATCH"
  | "GATE_INVALID_TIMESTAMP"
  | "GATE_FUTURE_EVIDENCE"
  | "GATE_MISSING_PROVENANCE"
  | "GATE_UNSAFE_PROVENANCE"
  | "FINAL_ACCEPTANCE_REJECTED"
  | "FINAL_ACCEPTANCE_INVALID_TIMESTAMP"
  | "FINAL_ACCEPTANCE_FUTURE_EVIDENCE"
  | "FINAL_ACCEPTANCE_MISSING_PROVENANCE"
  | "FINAL_ACCEPTANCE_UNSAFE_PROVENANCE";

export type V1ReleaseBlockerV1 = {
  code: V1ReleaseBlockerCodeV1;
  gateId: V1ReleaseGateIdV1 | null;
  detail: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1ReleaseGateResultV1 = {
  gateId: V1ReleaseGateIdV1;
  status: "PASS" | "BLOCKING";
  state: V1ReleaseGateStateV1 | "MISSING" | "DUPLICATE";
  freshness: V1ReleaseFreshnessV1 | "UNKNOWN";
  releaseSha: string | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1ReleaseCertificateV1 = {
  contractVersion: "V1_RELEASE_CERTIFICATE_V1";
  releaseSha: string;
  generatedAt: string;
  mechanicalState: "READY" | "BLOCKED";
  releaseState: "BLOCKED" | "READY_FOR_KEEGAN_ACCEPTANCE" | "RELEASED";
  keeganActionRequired: "YES" | "NO" | "UNKNOWN";
  gates: readonly V1ReleaseGateResultV1[];
  blockers: readonly V1ReleaseBlockerV1[];
  certifiedClaims: {
    integratedCode: boolean;
    productionPropagation: boolean;
    productionSmoke: boolean;
    executiveHomeTruth: boolean;
    crmDirectoryReads: boolean;
    releaseReviewAudit: boolean;
    p0CorrectnessSecurity: boolean;
    ionosThreeMailboxProof: boolean;
  };
  authority: {
    canDeploy: false;
    canMutateProduction: false;
    canSendEmail: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const UNSAFE_EVIDENCE_REF = /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanEvidenceRefs(refs: readonly string[] | undefined): string[] {
  if (!refs) return [];
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
}

function sanitizedEvidenceRefs(refs: readonly string[] | undefined): {
  refs: string[];
  unsafe: boolean;
} {
  const cleaned = cleanEvidenceRefs(refs);
  const unsafe = cleaned.some((ref) => UNSAFE_EVIDENCE_REF.test(ref));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function blocker(
  code: V1ReleaseBlockerCodeV1,
  gateId: V1ReleaseGateIdV1 | null,
  detail: string,
  evidenceRefs: readonly string[],
  actionRequirement: V1ReleaseActionRequirementV1
): V1ReleaseBlockerV1 {
  return {
    code,
    gateId,
    detail,
    evidenceRefs: [...evidenceRefs],
    actionRequirement
  };
}

function gateClaim(
  results: readonly V1ReleaseGateResultV1[],
  gateId: V1ReleaseGateIdV1
): boolean {
  return results.find((gate) => gate.gateId === gateId)?.status === "PASS";
}

function actionRequirementFromBlockers(
  blockers: readonly V1ReleaseBlockerV1[]
): "YES" | "NO" | "UNKNOWN" {
  if (blockers.some((entry) => entry.actionRequirement === "KEEGAN")) return "YES";
  if (blockers.length > 0 && blockers.every((entry) => entry.actionRequirement === "NONE")) return "NO";
  return blockers.length === 0 ? "NO" : "UNKNOWN";
}

/**
 * Compiles a fail-closed Useful V1 release certificate from explicit evidence.
 *
 * The compiler does not inspect GitHub, Vercel, IONOS, production data, or secrets.
 * Callers must supply already-collected evidence. A PASS claim is accepted only when
 * it is current, tied to the exact release SHA, timestamp-valid, and provenance-backed.
 */
export function compileV1ReleaseCertificateV1(
  input: V1ReleaseCertificationInputV1
): V1ReleaseCertificateV1 {
  const blockers: V1ReleaseBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const generatedAtMs = parsedTimestamp(input.generatedAt);

  if (!releaseShaValid) {
    blockers.push(
      blocker(
        "INVALID_RELEASE_SHA",
        null,
        "Release certification requires an exact lowercase 40-character Git commit SHA.",
        [],
        "UNKNOWN"
      )
    );
  }

  if (generatedAtMs == null) {
    blockers.push(
      blocker(
        "INVALID_GENERATED_AT",
        null,
        "Release certification generatedAt must be a valid timestamp.",
        [],
        "UNKNOWN"
      )
    );
  }

  const byGate = new Map<V1ReleaseGateIdV1, V1ReleaseGateEvidenceV1[]>();
  for (const gate of input.gates) {
    const current = byGate.get(gate.gateId) ?? [];
    current.push(gate);
    byGate.set(gate.gateId, current);
  }

  const gateResults: V1ReleaseGateResultV1[] = [];

  for (const gateId of V1_RELEASE_REQUIRED_GATES_V1) {
    const evidence = byGate.get(gateId) ?? [];

    if (evidence.length === 0) {
      blockers.push(
        blocker(
          "MISSING_GATE",
          gateId,
          `${gateId} has no release evidence. Missing evidence cannot be treated as PASS.`,
          [],
          "UNKNOWN"
        )
      );
      gateResults.push({
        gateId,
        status: "BLOCKING",
        state: "MISSING",
        freshness: "UNKNOWN",
        releaseSha: null,
        observedAt: null,
        evidenceRefs: [],
        actionRequirement: "UNKNOWN"
      });
      continue;
    }

    if (evidence.length > 1) {
      const mergedRefs = sanitizedEvidenceRefs(evidence.flatMap((entry) => entry.evidenceRefs));
      const actionRequirement = evidence.some((entry) => entry.actionRequirement === "KEEGAN")
        ? "KEEGAN"
        : evidence.every((entry) => entry.actionRequirement === "NONE")
          ? "NONE"
          : "UNKNOWN";

      blockers.push(
        blocker(
          "DUPLICATE_GATE",
          gateId,
          `${gateId} has multiple evidence records. The certificate refuses to choose a winner.`,
          mergedRefs.refs,
          actionRequirement
        )
      );
      if (mergedRefs.unsafe) {
        blockers.push(
          blocker(
            "GATE_UNSAFE_PROVENANCE",
            gateId,
            `${gateId} evidence references contain secret/reference material that must not enter a release certificate.`,
            [],
            actionRequirement
          )
        );
      }
      gateResults.push({
        gateId,
        status: "BLOCKING",
        state: "DUPLICATE",
        freshness: "UNKNOWN",
        releaseSha: null,
        observedAt: null,
        evidenceRefs: mergedRefs.refs,
        actionRequirement
      });
      continue;
    }

    const gate = evidence[0];
    const sanitizedRefs = sanitizedEvidenceRefs(gate.evidenceRefs);
    const refs = sanitizedRefs.refs;
    const gateTimestampMs = parsedTimestamp(gate.observedAt);
    let gateBlocking = false;

    if (gate.state !== "PASS") {
      blockers.push(
        blocker(
          "GATE_NOT_PASS",
          gateId,
          `${gateId} is ${gate.state}; only explicit PASS evidence can satisfy the release gate.`,
          refs,
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    if (gate.freshness !== "CURRENT") {
      blockers.push(
        blocker(
          "GATE_NOT_CURRENT",
          gateId,
          `${gateId} freshness is ${gate.freshness}; stale or unknown evidence cannot certify release readiness.`,
          refs,
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    if (!releaseShaValid || gate.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "GATE_SHA_MISMATCH",
          gateId,
          `${gateId} is not explicitly bound to the exact release SHA.`,
          refs,
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    if (gateTimestampMs == null) {
      blockers.push(
        blocker(
          "GATE_INVALID_TIMESTAMP",
          gateId,
          `${gateId} observedAt is not a valid timestamp.`,
          refs,
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    } else if (generatedAtMs != null && gateTimestampMs > generatedAtMs) {
      blockers.push(
        blocker(
          "GATE_FUTURE_EVIDENCE",
          gateId,
          `${gateId} evidence is dated after the certificate generation time.`,
          refs,
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    if (gate.state === "PASS" && refs.length === 0 && !sanitizedRefs.unsafe) {
      blockers.push(
        blocker(
          "GATE_MISSING_PROVENANCE",
          gateId,
          `${gateId} claims PASS without an evidence reference.`,
          [],
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    if (sanitizedRefs.unsafe) {
      blockers.push(
        blocker(
          "GATE_UNSAFE_PROVENANCE",
          gateId,
          `${gateId} evidence references contain secret/reference material that must not enter a release certificate.`,
          [],
          gate.actionRequirement
        )
      );
      gateBlocking = true;
    }

    gateResults.push({
      gateId,
      status: gateBlocking ? "BLOCKING" : "PASS",
      state: gate.state,
      freshness: gate.freshness,
      releaseSha: gate.releaseSha,
      observedAt: gate.observedAt,
      evidenceRefs: refs,
      actionRequirement: gate.actionRequirement
    });
  }

  const mechanicalState = blockers.length === 0 ? "READY" : "BLOCKED";
  let releaseState: V1ReleaseCertificateV1["releaseState"] = "BLOCKED";
  let keeganActionRequired: V1ReleaseCertificateV1["keeganActionRequired"] =
    actionRequirementFromBlockers(blockers);

  if (mechanicalState === "READY") {
    const acceptanceRefs = sanitizedEvidenceRefs(input.finalAcceptance.evidenceRefs);
    const acceptanceAtMs = parsedTimestamp(input.finalAcceptance.observedAt);

    if (input.finalAcceptance.state === "ACCEPTED") {
      let acceptanceInvalid = false;

      if (acceptanceAtMs == null) {
        blockers.push(
          blocker(
            "FINAL_ACCEPTANCE_INVALID_TIMESTAMP",
            null,
            "Final Keegan acceptance requires a valid observedAt timestamp.",
            acceptanceRefs.refs,
            "KEEGAN"
          )
        );
        acceptanceInvalid = true;
      } else if (generatedAtMs != null && acceptanceAtMs > generatedAtMs) {
        blockers.push(
          blocker(
            "FINAL_ACCEPTANCE_FUTURE_EVIDENCE",
            null,
            "Final Keegan acceptance cannot be dated after certificate generation.",
            acceptanceRefs.refs,
            "KEEGAN"
          )
        );
        acceptanceInvalid = true;
      }

      if (acceptanceRefs.refs.length === 0 && !acceptanceRefs.unsafe) {
        blockers.push(
          blocker(
            "FINAL_ACCEPTANCE_MISSING_PROVENANCE",
            null,
            "Final Keegan acceptance must have an evidence reference.",
            [],
            "KEEGAN"
          )
        );
        acceptanceInvalid = true;
      }

      if (acceptanceRefs.unsafe) {
        blockers.push(
          blocker(
            "FINAL_ACCEPTANCE_UNSAFE_PROVENANCE",
            null,
            "Final Keegan acceptance evidence contains secret/reference material that must not enter a release certificate.",
            [],
            "KEEGAN"
          )
        );
        acceptanceInvalid = true;
      }

      if (acceptanceInvalid) {
        releaseState = "BLOCKED";
        keeganActionRequired = "YES";
      } else {
        releaseState = "RELEASED";
        keeganActionRequired = "NO";
      }
    } else if (input.finalAcceptance.state === "REJECTED") {
      blockers.push(
        blocker(
          "FINAL_ACCEPTANCE_REJECTED",
          null,
          "Final Keegan acceptance is explicitly REJECTED; release remains blocked until findings are resolved and acceptance is repeated.",
          acceptanceRefs.refs,
          "KEEGAN"
        )
      );
      releaseState = "BLOCKED";
      keeganActionRequired = "YES";
    } else {
      releaseState = "READY_FOR_KEEGAN_ACCEPTANCE";
      keeganActionRequired = "YES";
    }
  }

  return {
    contractVersion: "V1_RELEASE_CERTIFICATE_V1",
    releaseSha: input.releaseSha,
    generatedAt: input.generatedAt,
    mechanicalState,
    releaseState,
    keeganActionRequired,
    gates: gateResults,
    blockers,
    certifiedClaims: {
      integratedCode: gateClaim(gateResults, "INTEGRATED_CODE"),
      productionPropagation: gateClaim(gateResults, "PRODUCTION_PROPAGATION"),
      productionSmoke: gateClaim(gateResults, "PRODUCTION_SMOKE"),
      executiveHomeTruth: gateClaim(gateResults, "EXECUTIVE_HOME_TRUTH"),
      crmDirectoryReads: gateClaim(gateResults, "CRM_DIRECTORY_READS"),
      releaseReviewAudit: gateClaim(gateResults, "RELEASE_REVIEW_AUDIT"),
      p0CorrectnessSecurity: gateClaim(gateResults, "P0_CORRECTNESS_SECURITY"),
      ionosThreeMailboxProof: gateClaim(gateResults, "IONOS_THREE_MAILBOX_PROOF")
    },
    authority: {
      canDeploy: false,
      canMutateProduction: false,
      canSendEmail: false,
      canBypassApproval: false
    }
  };
}

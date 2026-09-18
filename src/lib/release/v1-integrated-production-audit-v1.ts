import type { V1ReleaseGateEvidenceV1 } from "@/lib/release/v1-release-certificate-v1";

export const V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1 = [
  "TYPECHECK",
  "TEST",
  "BUILD",
  "DIFF_CHECK"
] as const;

export type V1IntegratedCodeRequiredCheckIdV1 =
  (typeof V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1)[number];

export type V1IntegratedCodeCheckEvidenceV1 = {
  checkId: V1IntegratedCodeRequiredCheckIdV1;
  state: "PASS" | "FAIL" | "UNKNOWN";
  releaseSha: string | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
};

export type V1IntegratedCodeEvidenceV1 = {
  workflowName: "Validated Main";
  branch: "main";
  event: "push";
  state: "PASS" | "FAIL" | "CANCELLED" | "UNKNOWN";
  releaseSha: string | null;
  completedAt: string | null;
  requiredChecks: readonly V1IntegratedCodeCheckEvidenceV1[];
  evidenceRefs: readonly string[];
};

export type V1ProductionPropagationEvidenceV1 = {
  provider: "VERCEL";
  environment: "PRODUCTION";
  proofName: "Prove Vercel production propagation";
  state: "DEPLOYED" | "FAILED" | "UNKNOWN";
  releaseSha: string | null;
  observedAt: string | null;
  evidenceRefs: readonly string[];
};

export type V1IntegratedProductionAuditInputV1 = {
  releaseSha: string;
  evaluatedAt: string;
  maxObservationAgeMs: number;
  integratedCode: V1IntegratedCodeEvidenceV1;
  productionPropagation: V1ProductionPropagationEvidenceV1;
};

export type V1IntegratedProductionAuditIssueSeverityV1 = "FAIL" | "BLOCKED";
export type V1IntegratedProductionAuditGateV1 =
  | "INTEGRATED_CODE"
  | "PRODUCTION_PROPAGATION";

export type V1IntegratedProductionAuditIssueCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_EVALUATED_AT"
  | "INVALID_FRESHNESS_POLICY"
  | "UNSAFE_PROVENANCE"
  | "MISSING_PROVENANCE"
  | "INTEGRATED_WORKFLOW_MISMATCH"
  | "INTEGRATED_BRANCH_MISMATCH"
  | "INTEGRATED_EVENT_MISMATCH"
  | "INTEGRATED_STATE_FAILED"
  | "INTEGRATED_STATE_NOT_PASS"
  | "INTEGRATED_SHA_MISMATCH"
  | "INTEGRATED_TIMESTAMP_INVALID"
  | "INTEGRATED_FUTURE_EVIDENCE"
  | "INTEGRATED_STALE_EVIDENCE"
  | "REQUIRED_CHECK_MISSING"
  | "REQUIRED_CHECK_DUPLICATE"
  | "REQUIRED_CHECK_UNEXPECTED"
  | "REQUIRED_CHECK_FAILED"
  | "REQUIRED_CHECK_UNKNOWN"
  | "REQUIRED_CHECK_SHA_MISMATCH"
  | "REQUIRED_CHECK_TIMESTAMP_INVALID"
  | "REQUIRED_CHECK_FUTURE_EVIDENCE"
  | "REQUIRED_CHECK_AFTER_WORKFLOW"
  | "PROPAGATION_PROVIDER_MISMATCH"
  | "PROPAGATION_ENVIRONMENT_MISMATCH"
  | "PROPAGATION_PROOF_MISMATCH"
  | "PROPAGATION_FAILED"
  | "PROPAGATION_NOT_DEPLOYED"
  | "PROPAGATION_SHA_MISMATCH"
  | "PROPAGATION_TIMESTAMP_INVALID"
  | "PROPAGATION_FUTURE_EVIDENCE"
  | "PROPAGATION_STALE_EVIDENCE"
  | "PROPAGATION_PRECEDES_VALIDATION";

export type V1IntegratedProductionAuditIssueV1 = {
  code: V1IntegratedProductionAuditIssueCodeV1;
  severity: V1IntegratedProductionAuditIssueSeverityV1;
  gateId: V1IntegratedProductionAuditGateV1 | null;
  detail: string;
  evidenceRefs: readonly string[];
};

export type V1IntegratedProductionAuditResultV1 = {
  contractVersion: "V1_INTEGRATED_PRODUCTION_AUDIT_V1";
  disposition: "PASS" | "FAIL" | "BLOCKED";
  evidence: readonly [V1ReleaseGateEvidenceV1, V1ReleaseGateEvidenceV1];
  issues: readonly V1IntegratedProductionAuditIssueV1[];
  authority: {
    canDeploy: false;
    canMutateProduction: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRefs(refs: readonly string[] | undefined): {
  refs: string[];
  unsafe: boolean;
} {
  const cleaned = [
    ...new Set((refs ?? []).map((entry) => entry.trim()).filter(Boolean))
  ].sort();
  const unsafe = cleaned.some((entry) => UNSAFE_EVIDENCE_REF.test(entry));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function issue(
  code: V1IntegratedProductionAuditIssueCodeV1,
  severity: V1IntegratedProductionAuditIssueSeverityV1,
  gateId: V1IntegratedProductionAuditGateV1 | null,
  detail: string,
  evidenceRefs: readonly string[] = []
): V1IntegratedProductionAuditIssueV1 {
  return { code, severity, gateId, detail, evidenceRefs: [...evidenceRefs] };
}

function collectRefs(
  refs: readonly string[] | undefined,
  gateId: V1IntegratedProductionAuditGateV1,
  context: string,
  issues: V1IntegratedProductionAuditIssueV1[],
  requireNonEmpty = true
): string[] {
  const sanitized = sanitizeRefs(refs);
  if (sanitized.unsafe) {
    issues.push(
      issue(
        "UNSAFE_PROVENANCE",
        "BLOCKED",
        gateId,
        `${context} contains secret-like provenance and was removed from release evidence.`
      )
    );
    return [];
  }
  if (requireNonEmpty && sanitized.refs.length === 0) {
    issues.push(
      issue(
        "MISSING_PROVENANCE",
        "BLOCKED",
        gateId,
        `${context} requires explicit evidence provenance.`
      )
    );
  }
  return sanitized.refs;
}

function gateDisposition(
  issues: readonly V1IntegratedProductionAuditIssueV1[],
  gateId: V1IntegratedProductionAuditGateV1
): "PASS" | "FAIL" | "BLOCKED" {
  const relevant = issues.filter(
    (entry) => entry.gateId == null || entry.gateId === gateId
  );
  if (relevant.some((entry) => entry.severity === "FAIL")) return "FAIL";
  if (relevant.length > 0) return "BLOCKED";
  return "PASS";
}

function evidenceState(
  disposition: "PASS" | "FAIL" | "BLOCKED"
): V1ReleaseGateEvidenceV1["state"] {
  if (disposition === "PASS") return "PASS";
  if (disposition === "FAIL") return "FAIL";
  return "BLOCKED";
}

function freshnessFor(
  observedAtMs: number | null,
  evaluatedAtMs: number | null,
  maxObservationAgeMs: number,
  policyValid: boolean
): V1ReleaseGateEvidenceV1["freshness"] {
  if (observedAtMs == null || evaluatedAtMs == null || !policyValid) return "UNKNOWN";
  if (observedAtMs > evaluatedAtMs) return "UNKNOWN";
  return evaluatedAtMs - observedAtMs > maxObservationAgeMs ? "STALE" : "CURRENT";
}

/**
 * Compiles explicit exact-SHA observations for the two Git/Vercel release gates
 * that precede the higher-level Useful V1 smoke and acceptance gates.
 *
 * This compiler does not call GitHub or Vercel, deploy, mutate production, or
 * infer that a successful CI run reached production. Integrated validation and
 * production propagation must be supplied as distinct, provenance-backed facts.
 */
export function compileV1IntegratedProductionAuditV1(
  input: V1IntegratedProductionAuditInputV1
): V1IntegratedProductionAuditResultV1 {
  const issues: V1IntegratedProductionAuditIssueV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const evaluatedAtMs = parsedTimestamp(input.evaluatedAt);
  const freshnessPolicyValid =
    Number.isFinite(input.maxObservationAgeMs) && input.maxObservationAgeMs > 0;

  if (!releaseShaValid) {
    issues.push(
      issue(
        "INVALID_RELEASE_SHA",
        "BLOCKED",
        null,
        "Integrated production audit requires an exact lowercase 40-character release SHA."
      )
    );
  }
  if (evaluatedAtMs == null) {
    issues.push(
      issue(
        "INVALID_EVALUATED_AT",
        "BLOCKED",
        null,
        "Integrated production audit evaluatedAt must be a valid timestamp."
      )
    );
  }
  if (!freshnessPolicyValid) {
    issues.push(
      issue(
        "INVALID_FRESHNESS_POLICY",
        "BLOCKED",
        null,
        "maxObservationAgeMs must be a positive finite caller-owned freshness limit."
      )
    );
  }

  const integratedRefs = collectRefs(
    input.integratedCode.evidenceRefs,
    "INTEGRATED_CODE",
    "Integrated-code workflow observation",
    issues
  );
  const integratedAtMs = parsedTimestamp(input.integratedCode.completedAt);

  if (input.integratedCode.workflowName !== "Validated Main") {
    issues.push(
      issue(
        "INTEGRATED_WORKFLOW_MISMATCH",
        "BLOCKED",
        "INTEGRATED_CODE",
        "Integrated-code evidence must come from the canonical Validated Main workflow.",
        integratedRefs
      )
    );
  }
  if (input.integratedCode.branch !== "main") {
    issues.push(
      issue(
        "INTEGRATED_BRANCH_MISMATCH",
        "BLOCKED",
        "INTEGRATED_CODE",
        "Integrated-code evidence must be observed on canonical main.",
        integratedRefs
      )
    );
  }
  if (input.integratedCode.event !== "push") {
    issues.push(
      issue(
        "INTEGRATED_EVENT_MISMATCH",
        "BLOCKED",
        "INTEGRATED_CODE",
        "Pull-request validation alone cannot certify integrated main; a push observation is required.",
        integratedRefs
      )
    );
  }
  if (input.integratedCode.state === "FAIL") {
    issues.push(
      issue(
        "INTEGRATED_STATE_FAILED",
        "FAIL",
        "INTEGRATED_CODE",
        "Canonical integrated validation explicitly failed.",
        integratedRefs
      )
    );
  } else if (input.integratedCode.state !== "PASS") {
    issues.push(
      issue(
        "INTEGRATED_STATE_NOT_PASS",
        "BLOCKED",
        "INTEGRATED_CODE",
        `Canonical integrated validation is ${input.integratedCode.state}; only explicit PASS can satisfy the gate.`,
        integratedRefs
      )
    );
  }
  if (!releaseShaValid || input.integratedCode.releaseSha !== input.releaseSha) {
    issues.push(
      issue(
        "INTEGRATED_SHA_MISMATCH",
        "BLOCKED",
        "INTEGRATED_CODE",
        "Integrated validation is not explicitly bound to the exact release SHA.",
        integratedRefs
      )
    );
  }
  if (integratedAtMs == null) {
    issues.push(
      issue(
        "INTEGRATED_TIMESTAMP_INVALID",
        "BLOCKED",
        "INTEGRATED_CODE",
        "Integrated validation completedAt must be a valid timestamp.",
        integratedRefs
      )
    );
  } else if (evaluatedAtMs != null) {
    if (integratedAtMs > evaluatedAtMs) {
      issues.push(
        issue(
          "INTEGRATED_FUTURE_EVIDENCE",
          "BLOCKED",
          "INTEGRATED_CODE",
          "Integrated validation is dated after the audit evaluation instant.",
          integratedRefs
        )
      );
    } else if (
      freshnessPolicyValid &&
      evaluatedAtMs - integratedAtMs > input.maxObservationAgeMs
    ) {
      issues.push(
        issue(
          "INTEGRATED_STALE_EVIDENCE",
          "BLOCKED",
          "INTEGRATED_CODE",
          "Integrated validation is older than the caller-owned freshness limit.",
          integratedRefs
        )
      );
    }
  }

  const requiredCheckIds = new Set<string>(V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1);
  const checksById = new Map<string, V1IntegratedCodeCheckEvidenceV1[]>();
  for (const check of input.integratedCode.requiredChecks) {
    const current = checksById.get(check.checkId) ?? [];
    current.push(check);
    checksById.set(check.checkId, current);
    if (!requiredCheckIds.has(check.checkId)) {
      const refs = collectRefs(
        check.evidenceRefs,
        "INTEGRATED_CODE",
        `Unexpected integrated check ${String(check.checkId)}`,
        issues,
        false
      );
      issues.push(
        issue(
          "REQUIRED_CHECK_UNEXPECTED",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Integrated validation contains unexpected check ${String(check.checkId)}.`,
          refs
        )
      );
    }
  }

  for (const checkId of V1_INTEGRATED_CODE_REQUIRED_CHECKS_V1) {
    const checks = checksById.get(checkId) ?? [];
    if (checks.length === 0) {
      issues.push(
        issue(
          "REQUIRED_CHECK_MISSING",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Integrated validation is missing required ${checkId} evidence.`,
          integratedRefs
        )
      );
      continue;
    }
    if (checks.length > 1) {
      const refs = collectRefs(
        checks.flatMap((entry) => entry.evidenceRefs),
        "INTEGRATED_CODE",
        `Duplicate integrated ${checkId} evidence`,
        issues,
        false
      );
      issues.push(
        issue(
          "REQUIRED_CHECK_DUPLICATE",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Integrated validation has multiple ${checkId} records; the compiler refuses to choose one.`,
          refs
        )
      );
      continue;
    }

    const check = checks[0];
    const checkRefs = collectRefs(
      check.evidenceRefs,
      "INTEGRATED_CODE",
      `Integrated ${checkId} evidence`,
      issues
    );
    if (check.state === "FAIL") {
      issues.push(
        issue(
          "REQUIRED_CHECK_FAILED",
          "FAIL",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} check explicitly failed.`,
          checkRefs
        )
      );
    } else if (check.state !== "PASS") {
      issues.push(
        issue(
          "REQUIRED_CHECK_UNKNOWN",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} check is not explicitly PASS.`,
          checkRefs
        )
      );
    }
    if (!releaseShaValid || check.releaseSha !== input.releaseSha) {
      issues.push(
        issue(
          "REQUIRED_CHECK_SHA_MISMATCH",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} evidence is not bound to the exact release SHA.`,
          checkRefs
        )
      );
    }
    const checkAtMs = parsedTimestamp(check.observedAt);
    if (checkAtMs == null) {
      issues.push(
        issue(
          "REQUIRED_CHECK_TIMESTAMP_INVALID",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} evidence has an invalid timestamp.`,
          checkRefs
        )
      );
    } else if (evaluatedAtMs != null && checkAtMs > evaluatedAtMs) {
      issues.push(
        issue(
          "REQUIRED_CHECK_FUTURE_EVIDENCE",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} evidence is dated after the audit evaluation instant.`,
          checkRefs
        )
      );
    }
    if (checkAtMs != null && integratedAtMs != null && checkAtMs > integratedAtMs) {
      issues.push(
        issue(
          "REQUIRED_CHECK_AFTER_WORKFLOW",
          "BLOCKED",
          "INTEGRATED_CODE",
          `Required integrated ${checkId} evidence is dated after the workflow completion observation.`,
          checkRefs
        )
      );
    }
  }

  const propagationRefs = collectRefs(
    input.productionPropagation.evidenceRefs,
    "PRODUCTION_PROPAGATION",
    "Production-propagation observation",
    issues
  );
  const propagationAtMs = parsedTimestamp(input.productionPropagation.observedAt);

  if (input.productionPropagation.provider !== "VERCEL") {
    issues.push(
      issue(
        "PROPAGATION_PROVIDER_MISMATCH",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation must be explicitly observed through the authorized Vercel production path.",
        propagationRefs
      )
    );
  }
  if (input.productionPropagation.environment !== "PRODUCTION") {
    issues.push(
      issue(
        "PROPAGATION_ENVIRONMENT_MISMATCH",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Preview or unknown environments cannot certify production propagation.",
        propagationRefs
      )
    );
  }
  if (input.productionPropagation.proofName !== "Prove Vercel production propagation") {
    issues.push(
      issue(
        "PROPAGATION_PROOF_MISMATCH",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation must use the canonical post-validation production proof.",
        propagationRefs
      )
    );
  }
  if (input.productionPropagation.state === "FAILED") {
    issues.push(
      issue(
        "PROPAGATION_FAILED",
        "FAIL",
        "PRODUCTION_PROPAGATION",
        "Production propagation explicitly failed.",
        propagationRefs
      )
    );
  } else if (input.productionPropagation.state !== "DEPLOYED") {
    issues.push(
      issue(
        "PROPAGATION_NOT_DEPLOYED",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation is not explicitly observed as DEPLOYED.",
        propagationRefs
      )
    );
  }
  if (!releaseShaValid || input.productionPropagation.releaseSha !== input.releaseSha) {
    issues.push(
      issue(
        "PROPAGATION_SHA_MISMATCH",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation is not bound to the exact release SHA.",
        propagationRefs
      )
    );
  }
  if (propagationAtMs == null) {
    issues.push(
      issue(
        "PROPAGATION_TIMESTAMP_INVALID",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation observedAt must be a valid timestamp.",
        propagationRefs
      )
    );
  } else if (evaluatedAtMs != null) {
    if (propagationAtMs > evaluatedAtMs) {
      issues.push(
        issue(
          "PROPAGATION_FUTURE_EVIDENCE",
          "BLOCKED",
          "PRODUCTION_PROPAGATION",
          "Production propagation is dated after the audit evaluation instant.",
          propagationRefs
        )
      );
    } else if (
      freshnessPolicyValid &&
      evaluatedAtMs - propagationAtMs > input.maxObservationAgeMs
    ) {
      issues.push(
        issue(
          "PROPAGATION_STALE_EVIDENCE",
          "BLOCKED",
          "PRODUCTION_PROPAGATION",
          "Production propagation is older than the caller-owned freshness limit.",
          propagationRefs
        )
      );
    }
  }
  if (
    propagationAtMs != null &&
    integratedAtMs != null &&
    propagationAtMs < integratedAtMs
  ) {
    issues.push(
      issue(
        "PROPAGATION_PRECEDES_VALIDATION",
        "BLOCKED",
        "PRODUCTION_PROPAGATION",
        "Production propagation observation predates integrated validation completion for the same release.",
        propagationRefs
      )
    );
  }

  const integratedDisposition = gateDisposition(issues, "INTEGRATED_CODE");
  const propagationDisposition = gateDisposition(issues, "PRODUCTION_PROPAGATION");
  const disposition =
    issues.some((entry) => entry.severity === "FAIL")
      ? "FAIL"
      : issues.length > 0
        ? "BLOCKED"
        : "PASS";

  const integratedEvidence: V1ReleaseGateEvidenceV1 = {
    gateId: "INTEGRATED_CODE",
    state: evidenceState(integratedDisposition),
    freshness: freshnessFor(
      integratedAtMs,
      evaluatedAtMs,
      input.maxObservationAgeMs,
      freshnessPolicyValid
    ),
    observedAt: input.integratedCode.completedAt ?? input.evaluatedAt,
    evidenceRefs: integratedRefs,
    releaseSha: input.integratedCode.releaseSha,
    actionRequirement: "NONE",
    detail:
      integratedDisposition === "PASS"
        ? "Exact-release main validation passed required integrated checks."
        : "Integrated-code release evidence is not sufficient to certify PASS."
  };

  const propagationEvidence: V1ReleaseGateEvidenceV1 = {
    gateId: "PRODUCTION_PROPAGATION",
    state: evidenceState(propagationDisposition),
    freshness: freshnessFor(
      propagationAtMs,
      evaluatedAtMs,
      input.maxObservationAgeMs,
      freshnessPolicyValid
    ),
    observedAt: input.productionPropagation.observedAt ?? input.evaluatedAt,
    evidenceRefs: propagationRefs,
    releaseSha: input.productionPropagation.releaseSha,
    actionRequirement: "NONE",
    detail:
      propagationDisposition === "PASS"
        ? "Exact-release production propagation was separately observed after integrated validation."
        : "Production-propagation release evidence is not sufficient to certify PASS."
  };

  return {
    contractVersion: "V1_INTEGRATED_PRODUCTION_AUDIT_V1",
    disposition,
    evidence: [integratedEvidence, propagationEvidence],
    issues: issues.map((entry) => ({
      ...entry,
      evidenceRefs: [...entry.evidenceRefs]
    })),
    authority: {
      canDeploy: false,
      canMutateProduction: false,
      canBypassApproval: false
    }
  };
}

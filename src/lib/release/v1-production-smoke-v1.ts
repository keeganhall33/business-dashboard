import type {
  V1ReleaseActionRequirementV1,
  V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";

export const V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1 = [
  "EXECUTIVE_HOME",
  "OPPORTUNITY_DETAIL",
  "CRM_PERSON",
  "CRM_COMPANY",
  "CRM_ACTIVITY",
  "STRATEGY",
  "DATA_EVIDENCE",
  "LEARNING",
  "EVENTS",
  "SPECIALISTS"
] as const;

export const V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1 = ["DESKTOP", "MOBILE"] as const;

export type V1ProductionSmokeStepIdV1 =
  (typeof V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1)[number];
export type V1ProductionSmokeDeviceClassV1 =
  (typeof V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1)[number];
export type V1ProductionSmokeStepStateV1 = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN";

export type V1ProductionSmokeObservationV1 = {
  stepId: V1ProductionSmokeStepIdV1;
  state: V1ProductionSmokeStepStateV1;
  observedAt: string;
  observedPath: string;
  evidenceRefs: readonly string[];
  releaseSha: string;
  actionRequirement: V1ReleaseActionRequirementV1;
  detail?: string | null;
};

export type V1ProductionSmokeDeviceObservationV1 = {
  deviceClass: V1ProductionSmokeDeviceClassV1;
  state: V1ProductionSmokeStepStateV1;
  observedAt: string;
  viewportWidth: number;
  viewportHeight: number;
  evidenceRefs: readonly string[];
  releaseSha: string;
  actionRequirement: V1ReleaseActionRequirementV1;
  detail?: string | null;
};

export type V1ProductionSmokeInputV1 = {
  releaseSha: string;
  generatedAt: string;
  environment: "PRODUCTION";
  observations: readonly V1ProductionSmokeObservationV1[];
  deviceObservations: readonly V1ProductionSmokeDeviceObservationV1[];
};

export type V1ProductionSmokeBlockerCodeV1 =
  | "INVALID_RELEASE_SHA"
  | "INVALID_GENERATED_AT"
  | "MISSING_STEP"
  | "DUPLICATE_STEP"
  | "STEP_OUT_OF_ORDER"
  | "STEP_NOT_PASS"
  | "STEP_SHA_MISMATCH"
  | "STEP_INVALID_TIMESTAMP"
  | "STEP_FUTURE_EVIDENCE"
  | "STEP_MISSING_PROVENANCE"
  | "STEP_UNSAFE_PROVENANCE"
  | "STEP_INVALID_PATH"
  | "STEP_ROUTE_MISMATCH"
  | "STEP_ACTION_REQUIRED"
  | "MISSING_DEVICE_COVERAGE"
  | "DUPLICATE_DEVICE_COVERAGE"
  | "DEVICE_NOT_PASS"
  | "DEVICE_SHA_MISMATCH"
  | "DEVICE_INVALID_TIMESTAMP"
  | "DEVICE_FUTURE_EVIDENCE"
  | "DEVICE_INVALID_VIEWPORT"
  | "DEVICE_VIEWPORT_MISMATCH"
  | "DEVICE_MISSING_PROVENANCE"
  | "DEVICE_UNSAFE_PROVENANCE"
  | "DEVICE_ACTION_REQUIRED";

export type V1ProductionSmokeBlockerV1 = {
  code: V1ProductionSmokeBlockerCodeV1;
  stepId: V1ProductionSmokeStepIdV1 | null;
  detail: string;
  evidenceRefs: readonly string[];
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1ProductionSmokeStepResultV1 = {
  stepId: V1ProductionSmokeStepIdV1;
  status: "PASS" | "BLOCKING";
  state: V1ProductionSmokeStepStateV1 | "MISSING" | "DUPLICATE";
  observedAt: string | null;
  observedPath: string | null;
  evidenceRefs: readonly string[];
  releaseSha: string | null;
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1ProductionSmokeDeviceResultV1 = {
  deviceClass: V1ProductionSmokeDeviceClassV1;
  status: "PASS" | "BLOCKING";
  state: V1ProductionSmokeStepStateV1 | "MISSING" | "DUPLICATE";
  observedAt: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  evidenceRefs: readonly string[];
  releaseSha: string | null;
  actionRequirement: V1ReleaseActionRequirementV1;
};

export type V1ProductionSmokeResultV1 = {
  contractVersion: "V1_PRODUCTION_SMOKE_V1";
  releaseSha: string;
  generatedAt: string;
  environment: "PRODUCTION";
  status: "PASS" | "BLOCKED";
  gateEvidence: V1ReleaseGateEvidenceV1;
  steps: readonly V1ProductionSmokeStepResultV1[];
  deviceCoverage: readonly V1ProductionSmokeDeviceResultV1[];
  blockers: readonly V1ProductionSmokeBlockerV1[];
  authority: {
    canDeploy: false;
    canMutateProduction: false;
    canSendEmail: false;
    canBypassApproval: false;
  };
};

const SHA_40 = /^[0-9a-f]{40}$/;
const SAFE_PATH = /^\/[^?#\s]*$/;
const SAFE_ENTITY_SEGMENT = "[A-Za-z0-9][A-Za-z0-9._~-]*";
const UNSAFE_EVIDENCE_REF =
  /(?:op:\/\/|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;
const MIN_VIEWPORT_DIMENSION = 240;
const MAX_VIEWPORT_DIMENSION = 8192;

const CANONICAL_STEP_PATHS_V1: Record<
  V1ProductionSmokeStepIdV1,
  { matcher: RegExp; description: string }
> = {
  EXECUTIVE_HOME: { matcher: /^\/dashboard\/?$/, description: "/dashboard" },
  OPPORTUNITY_DETAIL: {
    matcher: new RegExp(`^/opportunities-actions/opportunity/${SAFE_ENTITY_SEGMENT}/?$`),
    description: "/opportunities-actions/opportunity/<opaque-id>"
  },
  CRM_PERSON: {
    matcher: new RegExp(`^/relationships/people/${SAFE_ENTITY_SEGMENT}/?$`),
    description: "/relationships/people/<opaque-id>"
  },
  CRM_COMPANY: {
    matcher: new RegExp(`^/relationships/companies/${SAFE_ENTITY_SEGMENT}/?$`),
    description: "/relationships/companies/<opaque-id>"
  },
  CRM_ACTIVITY: { matcher: /^\/relationships\/activity\/?$/, description: "/relationships/activity" },
  STRATEGY: { matcher: /^\/strategy\/?$/, description: "/strategy" },
  DATA_EVIDENCE: { matcher: /^\/data-evidence\/?$/, description: "/data-evidence" },
  LEARNING: { matcher: /^\/learning\/?$/, description: "/learning" },
  EVENTS: { matcher: /^\/events-market-windows\/?$/, description: "/events-market-windows" },
  SPECIALISTS: { matcher: /^\/specialists\/?$/, description: "/specialists" }
};

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizedEvidenceRefs(refs: readonly string[] | undefined): {
  refs: string[];
  unsafe: boolean;
} {
  if (!refs) return { refs: [], unsafe: false };
  const cleaned = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
  const unsafe = cleaned.some((ref) => UNSAFE_EVIDENCE_REF.test(ref));
  return { refs: unsafe ? [] : cleaned, unsafe };
}

function blocker(
  code: V1ProductionSmokeBlockerCodeV1,
  stepId: V1ProductionSmokeStepIdV1 | null,
  detail: string,
  evidenceRefs: readonly string[],
  actionRequirement: V1ReleaseActionRequirementV1
): V1ProductionSmokeBlockerV1 {
  return { code, stepId, detail, evidenceRefs: [...evidenceRefs], actionRequirement };
}

function aggregateActionRequirement(
  values: readonly V1ReleaseActionRequirementV1[]
): V1ReleaseActionRequirementV1 {
  if (values.some((value) => value === "KEEGAN")) return "KEEGAN";
  if (values.length > 0 && values.every((value) => value === "NONE")) return "NONE";
  return "UNKNOWN";
}

function viewportIsFiniteAndBounded(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= MIN_VIEWPORT_DIMENSION &&
    height >= MIN_VIEWPORT_DIMENSION &&
    width <= MAX_VIEWPORT_DIMENSION &&
    height <= MAX_VIEWPORT_DIMENSION
  );
}

function viewportMatchesDeviceClass(
  deviceClass: V1ProductionSmokeDeviceClassV1,
  width: number
): boolean {
  return deviceClass === "MOBILE" ? width <= 767 : width >= 1024;
}

/**
 * Compiles explicit, already-observed production navigation and device-coherence evidence
 * into the canonical PRODUCTION_SMOKE gate used by the Useful V1 release certificate.
 *
 * This compiler performs no browser automation, network requests, authentication,
 * deployment, production mutation, or secret access. Callers must supply evidence from
 * the live production run. Missing, partial, conflicted, out-of-order, route-mismatched,
 * device-incomplete, or release-mismatched observations fail closed instead of being
 * promoted to release truth.
 */
export function compileV1ProductionSmokeV1(
  input: V1ProductionSmokeInputV1
): V1ProductionSmokeResultV1 {
  const blockers: V1ProductionSmokeBlockerV1[] = [];
  const releaseShaValid = SHA_40.test(input.releaseSha);
  const generatedAtMs = parsedTimestamp(input.generatedAt);

  if (!releaseShaValid) {
    blockers.push(
      blocker(
        "INVALID_RELEASE_SHA",
        null,
        "Production smoke evidence requires an exact lowercase 40-character Git commit SHA.",
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
        "Production smoke generatedAt must be a valid timestamp.",
        [],
        "UNKNOWN"
      )
    );
  }

  const byStep = new Map<V1ProductionSmokeStepIdV1, V1ProductionSmokeObservationV1[]>();
  for (const observation of input.observations) {
    const current = byStep.get(observation.stepId) ?? [];
    current.push(observation);
    byStep.set(observation.stepId, current);
  }

  const uniqueSequence = input.observations
    .filter((observation) => (byStep.get(observation.stepId)?.length ?? 0) === 1)
    .map((observation) => observation.stepId);
  const expectedPresentSequence = V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.filter(
    (stepId) => (byStep.get(stepId)?.length ?? 0) === 1
  );
  if (
    uniqueSequence.length === V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.length &&
    uniqueSequence.some((stepId, index) => stepId !== expectedPresentSequence[index])
  ) {
    blockers.push(
      blocker(
        "STEP_OUT_OF_ORDER",
        null,
        "Production smoke observations must follow the declared Useful V1 acceptance path in order.",
        [],
        aggregateActionRequirement(input.observations.map((entry) => entry.actionRequirement))
      )
    );
  }

  const stepResults: V1ProductionSmokeStepResultV1[] = [];

  for (const stepId of V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1) {
    const evidence = byStep.get(stepId) ?? [];

    if (evidence.length === 0) {
      blockers.push(
        blocker(
          "MISSING_STEP",
          stepId,
          `${stepId} has no live production observation. Missing smoke evidence cannot be treated as PASS.`,
          [],
          "UNKNOWN"
        )
      );
      stepResults.push({
        stepId,
        status: "BLOCKING",
        state: "MISSING",
        observedAt: null,
        observedPath: null,
        evidenceRefs: [],
        releaseSha: null,
        actionRequirement: "UNKNOWN"
      });
      continue;
    }

    if (evidence.length > 1) {
      const sanitized = sanitizedEvidenceRefs(evidence.flatMap((entry) => entry.evidenceRefs));
      const actionRequirement = aggregateActionRequirement(
        evidence.map((entry) => entry.actionRequirement)
      );
      blockers.push(
        blocker(
          "DUPLICATE_STEP",
          stepId,
          `${stepId} has multiple observations. The smoke compiler refuses to choose a winner.`,
          sanitized.refs,
          actionRequirement
        )
      );
      if (sanitized.unsafe) {
        blockers.push(
          blocker(
            "STEP_UNSAFE_PROVENANCE",
            stepId,
            `${stepId} evidence references contain secret-like material and were removed from output.`,
            [],
            actionRequirement
          )
        );
      }
      stepResults.push({
        stepId,
        status: "BLOCKING",
        state: "DUPLICATE",
        observedAt: null,
        observedPath: null,
        evidenceRefs: sanitized.refs,
        releaseSha: null,
        actionRequirement
      });
      continue;
    }

    const observation = evidence[0];
    const sanitized = sanitizedEvidenceRefs(observation.evidenceRefs);
    const observedAtMs = parsedTimestamp(observation.observedAt);
    const pathIsSafe = SAFE_PATH.test(observation.observedPath);
    const canonicalPath = CANONICAL_STEP_PATHS_V1[stepId];
    const pathMatchesStep = pathIsSafe && canonicalPath.matcher.test(observation.observedPath);
    let blocking = false;

    if (observation.state !== "PASS") {
      blockers.push(
        blocker(
          "STEP_NOT_PASS",
          stepId,
          `${stepId} is ${observation.state}; only an explicit live PASS can satisfy production smoke.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (!releaseShaValid || observation.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "STEP_SHA_MISMATCH",
          stepId,
          `${stepId} is not explicitly bound to the exact production release SHA.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (observedAtMs == null) {
      blockers.push(
        blocker(
          "STEP_INVALID_TIMESTAMP",
          stepId,
          `${stepId} observedAt is not a valid timestamp.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    } else if (generatedAtMs != null && observedAtMs > generatedAtMs) {
      blockers.push(
        blocker(
          "STEP_FUTURE_EVIDENCE",
          stepId,
          `${stepId} is dated after the smoke artifact generation time.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (!pathIsSafe) {
      blockers.push(
        blocker(
          "STEP_INVALID_PATH",
          stepId,
          `${stepId} must record a production pathname only, without query parameters, fragments, whitespace, or credentials.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    } else if (!pathMatchesStep) {
      blockers.push(
        blocker(
          "STEP_ROUTE_MISMATCH",
          stepId,
          `${stepId} must prove the canonical production route ${canonicalPath.description}; an arbitrary safe pathname cannot satisfy this smoke step.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (sanitized.refs.length === 0 && !sanitized.unsafe) {
      blockers.push(
        blocker(
          "STEP_MISSING_PROVENANCE",
          stepId,
          `${stepId} has no evidence reference.`,
          [],
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (sanitized.unsafe) {
      blockers.push(
        blocker(
          "STEP_UNSAFE_PROVENANCE",
          stepId,
          `${stepId} evidence references contain secret-like material and were removed from output.`,
          [],
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (observation.actionRequirement !== "NONE") {
      blockers.push(
        blocker(
          "STEP_ACTION_REQUIRED",
          stepId,
          `${stepId} still requires ${observation.actionRequirement} action and cannot certify a completed production smoke step.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    stepResults.push({
      stepId,
      status: blocking ? "BLOCKING" : "PASS",
      state: observation.state,
      observedAt: observation.observedAt,
      observedPath: pathMatchesStep ? observation.observedPath : null,
      evidenceRefs: sanitized.refs,
      releaseSha: observation.releaseSha,
      actionRequirement: observation.actionRequirement
    });
  }

  const deviceObservations = input.deviceObservations ?? [];
  const byDevice = new Map<
    V1ProductionSmokeDeviceClassV1,
    V1ProductionSmokeDeviceObservationV1[]
  >();
  for (const observation of deviceObservations) {
    const current = byDevice.get(observation.deviceClass) ?? [];
    current.push(observation);
    byDevice.set(observation.deviceClass, current);
  }

  const deviceCoverage: V1ProductionSmokeDeviceResultV1[] = [];
  for (const deviceClass of V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1) {
    const evidence = byDevice.get(deviceClass) ?? [];

    if (evidence.length === 0) {
      blockers.push(
        blocker(
          "MISSING_DEVICE_COVERAGE",
          null,
          `${deviceClass} has no live production coherence observation. Desktop and mobile proof are both required.`,
          [],
          "UNKNOWN"
        )
      );
      deviceCoverage.push({
        deviceClass,
        status: "BLOCKING",
        state: "MISSING",
        observedAt: null,
        viewportWidth: null,
        viewportHeight: null,
        evidenceRefs: [],
        releaseSha: null,
        actionRequirement: "UNKNOWN"
      });
      continue;
    }

    if (evidence.length > 1) {
      const sanitized = sanitizedEvidenceRefs(evidence.flatMap((entry) => entry.evidenceRefs));
      const actionRequirement = aggregateActionRequirement(
        evidence.map((entry) => entry.actionRequirement)
      );
      blockers.push(
        blocker(
          "DUPLICATE_DEVICE_COVERAGE",
          null,
          `${deviceClass} has multiple coherence observations. The smoke compiler refuses to choose a winner.`,
          sanitized.refs,
          actionRequirement
        )
      );
      if (sanitized.unsafe) {
        blockers.push(
          blocker(
            "DEVICE_UNSAFE_PROVENANCE",
            null,
            `${deviceClass} evidence references contain secret-like material and were removed from output.`,
            [],
            actionRequirement
          )
        );
      }
      deviceCoverage.push({
        deviceClass,
        status: "BLOCKING",
        state: "DUPLICATE",
        observedAt: null,
        viewportWidth: null,
        viewportHeight: null,
        evidenceRefs: sanitized.refs,
        releaseSha: null,
        actionRequirement
      });
      continue;
    }

    const observation = evidence[0];
    const sanitized = sanitizedEvidenceRefs(observation.evidenceRefs);
    const observedAtMs = parsedTimestamp(observation.observedAt);
    const validViewport = viewportIsFiniteAndBounded(
      observation.viewportWidth,
      observation.viewportHeight
    );
    const matchingViewport =
      validViewport && viewportMatchesDeviceClass(deviceClass, observation.viewportWidth);
    let blocking = false;

    if (observation.state !== "PASS") {
      blockers.push(
        blocker(
          "DEVICE_NOT_PASS",
          null,
          `${deviceClass} coherence is ${observation.state}; only explicit live PASS evidence can satisfy device coverage.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (!releaseShaValid || observation.releaseSha !== input.releaseSha) {
      blockers.push(
        blocker(
          "DEVICE_SHA_MISMATCH",
          null,
          `${deviceClass} coherence is not explicitly bound to the exact production release SHA.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (observedAtMs == null) {
      blockers.push(
        blocker(
          "DEVICE_INVALID_TIMESTAMP",
          null,
          `${deviceClass} observedAt is not a valid timestamp.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    } else if (generatedAtMs != null && observedAtMs > generatedAtMs) {
      blockers.push(
        blocker(
          "DEVICE_FUTURE_EVIDENCE",
          null,
          `${deviceClass} evidence is dated after the smoke artifact generation time.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (!validViewport) {
      blockers.push(
        blocker(
          "DEVICE_INVALID_VIEWPORT",
          null,
          `${deviceClass} requires finite integer viewport dimensions between ${MIN_VIEWPORT_DIMENSION} and ${MAX_VIEWPORT_DIMENSION} pixels.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    } else if (!matchingViewport) {
      blockers.push(
        blocker(
          "DEVICE_VIEWPORT_MISMATCH",
          null,
          `${deviceClass} viewport width ${observation.viewportWidth}px does not match the required class boundary.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (sanitized.refs.length === 0 && !sanitized.unsafe) {
      blockers.push(
        blocker(
          "DEVICE_MISSING_PROVENANCE",
          null,
          `${deviceClass} has no evidence reference.`,
          [],
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (sanitized.unsafe) {
      blockers.push(
        blocker(
          "DEVICE_UNSAFE_PROVENANCE",
          null,
          `${deviceClass} evidence references contain secret-like material and were removed from output.`,
          [],
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    if (observation.actionRequirement !== "NONE") {
      blockers.push(
        blocker(
          "DEVICE_ACTION_REQUIRED",
          null,
          `${deviceClass} still requires ${observation.actionRequirement} action and cannot certify completed device coherence.`,
          sanitized.refs,
          observation.actionRequirement
        )
      );
      blocking = true;
    }

    deviceCoverage.push({
      deviceClass,
      status: blocking ? "BLOCKING" : "PASS",
      state: observation.state,
      observedAt: observation.observedAt,
      viewportWidth: validViewport ? observation.viewportWidth : null,
      viewportHeight: validViewport ? observation.viewportHeight : null,
      evidenceRefs: sanitized.refs,
      releaseSha: observation.releaseSha,
      actionRequirement: observation.actionRequirement
    });
  }

  const status = blockers.length === 0 ? "PASS" : "BLOCKED";
  const allSafeRefs = [
    ...new Set([
      ...stepResults.flatMap((step) => step.evidenceRefs),
      ...deviceCoverage.flatMap((device) => device.evidenceRefs)
    ])
  ].sort();
  const validObservedTimes = [...stepResults, ...deviceCoverage]
    .map((entry) => ({ value: entry.observedAt, parsed: parsedTimestamp(entry.observedAt) }))
    .filter(
      (entry): entry is { value: string; parsed: number } =>
        entry.value != null && entry.parsed != null
    )
    .sort((a, b) => a.parsed - b.parsed);
  const latestObservedAt = validObservedTimes.at(-1)?.value ?? input.generatedAt;
  const gateActionRequirement = aggregateActionRequirement([
    ...stepResults.map((step) => step.actionRequirement),
    ...deviceCoverage.map((device) => device.actionRequirement)
  ]);

  const gateEvidence: V1ReleaseGateEvidenceV1 = {
    gateId: "PRODUCTION_SMOKE",
    state: status === "PASS" ? "PASS" : "BLOCKED",
    freshness: status === "PASS" ? "CURRENT" : "UNKNOWN",
    observedAt: latestObservedAt,
    evidenceRefs: allSafeRefs,
    releaseSha: releaseShaValid ? input.releaseSha : null,
    actionRequirement: status === "PASS" ? "NONE" : gateActionRequirement,
    detail:
      status === "PASS"
        ? "All required Useful V1 production smoke steps passed in order on canonical routes, with explicit desktop and mobile coherence proof, for the exact release SHA using provenance-backed observations."
        : `Production smoke remains blocked by ${blockers.length} evidence-integrity or observation blocker(s).`
  };

  return {
    contractVersion: "V1_PRODUCTION_SMOKE_V1",
    releaseSha: input.releaseSha,
    generatedAt: input.generatedAt,
    environment: input.environment,
    status,
    gateEvidence,
    steps: stepResults,
    deviceCoverage,
    blockers,
    authority: {
      canDeploy: false,
      canMutateProduction: false,
      canSendEmail: false,
      canBypassApproval: false
    }
  };
}

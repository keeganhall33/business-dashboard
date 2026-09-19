import { z } from "zod";

import {
  V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
  type V1ProductionSmokeBlockerV1,
  type V1ProductionSmokeDeviceClassV1,
  type V1ProductionSmokeInputV1,
  type V1ProductionSmokeResultV1,
  type V1ProductionSmokeStepIdV1
} from "@/lib/release/v1-production-smoke-v1";

const stepIdSchema = z.enum(V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1);
const deviceClassSchema = z.enum(V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1);
const stepStateSchema = z.enum(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);
const actionRequirementSchema = z.enum(["NONE", "KEEGAN", "UNKNOWN"]);

export const V1_PRODUCTION_SMOKE_INPUT_SCHEMA_V1 = z
  .object({
    releaseSha: z.string(),
    generatedAt: z.string(),
    environment: z.literal("PRODUCTION"),
    observations: z
      .array(
        z
          .object({
            stepId: stepIdSchema,
            state: stepStateSchema,
            observedAt: z.string(),
            observedPath: z.string(),
            evidenceRefs: z.array(z.string()).readonly(),
            releaseSha: z.string(),
            actionRequirement: actionRequirementSchema,
            detail: z.string().nullable().optional()
          })
          .strict()
      )
      .readonly(),
    deviceObservations: z
      .array(
        z
          .object({
            deviceClass: deviceClassSchema,
            state: stepStateSchema,
            observedAt: z.string(),
            viewportWidth: z.number().int(),
            viewportHeight: z.number().int(),
            evidenceRefs: z.array(z.string()).readonly(),
            releaseSha: z.string(),
            actionRequirement: actionRequirementSchema,
            detail: z.string().nullable().optional()
          })
          .strict()
      )
      .readonly()
  })
  .strict();

/**
 * Parses untrusted production-smoke JSON before it can contribute release evidence.
 * Unknown steps/device classes, extra truth-like fields, malformed records, missing
 * device coverage, or non-production inputs fail closed here rather than being silently
 * ignored by the compiler.
 */
export function parseV1ProductionSmokeInputV1(value: unknown): V1ProductionSmokeInputV1 {
  return V1_PRODUCTION_SMOKE_INPUT_SCHEMA_V1.parse(value);
}

function applyRuntimeFreshnessBoundaryV1(
  input: V1ProductionSmokeInputV1,
  compiled: V1ProductionSmokeResultV1
): V1ProductionSmokeResultV1 {
  // Preserve all existing compiler failures exactly. Runtime wall-clock enforcement is
  // an additional boundary that can only demote an otherwise-valid PASS artifact.
  if (compiled.status !== "PASS") return compiled;

  const runtimeNowMs = Date.now();
  const runtimeBlockers: V1ProductionSmokeBlockerV1[] = [];
  const blockingSteps = new Set<V1ProductionSmokeStepIdV1>();
  const blockingDevices = new Set<V1ProductionSmokeDeviceClassV1>();

  for (const observation of input.observations) {
    const observedAtMs = Date.parse(observation.observedAt);
    const result = compiled.steps.find((entry) => entry.stepId === observation.stepId);
    if (!Number.isFinite(observedAtMs) || !result) continue;

    if (observedAtMs > runtimeNowMs) {
      blockingSteps.add(observation.stepId);
      runtimeBlockers.push({
        code: "STEP_FUTURE_EVIDENCE",
        stepId: observation.stepId,
        detail: `${observation.stepId} is future-dated relative to the runtime smoke-certification clock.`,
        evidenceRefs: [...result.evidenceRefs],
        actionRequirement: result.actionRequirement
      });
    } else if (runtimeNowMs - observedAtMs > V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1) {
      blockingSteps.add(observation.stepId);
      runtimeBlockers.push({
        code: "STEP_STALE_EVIDENCE",
        stepId: observation.stepId,
        detail: `${observation.stepId} is older than the one-hour runtime production-smoke freshness window. Re-observe the live route for this release.`,
        evidenceRefs: [...result.evidenceRefs],
        actionRequirement: result.actionRequirement
      });
    }
  }

  for (const observation of input.deviceObservations) {
    const observedAtMs = Date.parse(observation.observedAt);
    const result = compiled.deviceCoverage.find(
      (entry) => entry.deviceClass === observation.deviceClass
    );
    if (!Number.isFinite(observedAtMs) || !result) continue;

    if (observedAtMs > runtimeNowMs) {
      blockingDevices.add(observation.deviceClass);
      runtimeBlockers.push({
        code: "DEVICE_FUTURE_EVIDENCE",
        stepId: null,
        detail: `${observation.deviceClass} evidence is future-dated relative to the runtime smoke-certification clock.`,
        evidenceRefs: [...result.evidenceRefs],
        actionRequirement: result.actionRequirement
      });
    } else if (runtimeNowMs - observedAtMs > V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1) {
      blockingDevices.add(observation.deviceClass);
      runtimeBlockers.push({
        code: "DEVICE_STALE_EVIDENCE",
        stepId: null,
        detail: `${observation.deviceClass} evidence is older than the one-hour runtime production-smoke freshness window. Re-observe live device coherence for this release.`,
        evidenceRefs: [...result.evidenceRefs],
        actionRequirement: result.actionRequirement
      });
    }
  }

  if (runtimeBlockers.length === 0) return compiled;

  return {
    ...compiled,
    status: "BLOCKED",
    gateEvidence: {
      ...compiled.gateEvidence,
      state: "BLOCKED",
      freshness: "UNKNOWN",
      actionRequirement: "NONE",
      detail: `Production smoke remains blocked by ${runtimeBlockers.length} runtime freshness blocker(s).`
    },
    steps: compiled.steps.map((entry) =>
      blockingSteps.has(entry.stepId) ? { ...entry, status: "BLOCKING" as const } : entry
    ),
    deviceCoverage: compiled.deviceCoverage.map((entry) =>
      blockingDevices.has(entry.deviceClass) ? { ...entry, status: "BLOCKING" as const } : entry
    ),
    blockers: [...compiled.blockers, ...runtimeBlockers]
  };
}

/**
 * Runtime-safe entry point. This validates and compiles evidence only; it performs no
 * live action. An otherwise-valid PASS artifact is additionally evaluated against the
 * non-overridable runtime wall clock so a frozen caller generatedAt cannot replay old
 * route or device observations as current production truth.
 */
export function compileRuntimeV1ProductionSmokeV1(value: unknown): V1ProductionSmokeResultV1 {
  const parsed = parseV1ProductionSmokeInputV1(value);
  return applyRuntimeFreshnessBoundaryV1(parsed, compileV1ProductionSmokeV1(parsed));
}

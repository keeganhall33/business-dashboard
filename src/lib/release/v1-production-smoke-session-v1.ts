import { z } from "zod";

import {
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
  type V1ProductionSmokeInputV1,
  type V1ProductionSmokeResultV1
} from "@/lib/release/v1-production-smoke-v1";

const smokeRunIdSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._~-]{7,127}$/,
    "smokeRunId must be an opaque 8-128 character identifier without private or secret-like delimiters"
  );
const stepIdSchema = z.enum(V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1);
const deviceClassSchema = z.enum(V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1);
const stepStateSchema = z.enum(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);
const actionRequirementSchema = z.enum(["NONE", "KEEGAN", "UNKNOWN"]);

const taggedStepSchema = z
  .object({
    smokeRunId: smokeRunIdSchema,
    stepId: stepIdSchema,
    state: stepStateSchema,
    observedAt: z.string(),
    observedPath: z.string(),
    evidenceRefs: z.array(z.string()).readonly(),
    releaseSha: z.string(),
    actionRequirement: actionRequirementSchema,
    detail: z.string().nullable().optional()
  })
  .strict();

const taggedDeviceSchema = z
  .object({
    smokeRunId: smokeRunIdSchema,
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
  .strict();

export const V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1 = z
  .object({
    smokeRunId: smokeRunIdSchema,
    releaseSha: z.string(),
    generatedAt: z.string(),
    environment: z.literal("PRODUCTION"),
    observations: z.array(taggedStepSchema).readonly(),
    deviceObservations: z.array(taggedDeviceSchema).readonly()
  })
  .strict();

export type V1ProductionSmokeSessionInputV1 = z.infer<
  typeof V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1
>;

function assertSingleRun(input: V1ProductionSmokeSessionInputV1): void {
  const mismatchedStep = input.observations.find(
    (observation) => observation.smokeRunId !== input.smokeRunId
  );
  if (mismatchedStep) {
    throw new Error(
      `SMOKE_RUN_ID_MISMATCH: ${mismatchedStep.stepId} does not belong to the declared production smoke run.`
    );
  }

  const mismatchedDevice = input.deviceObservations.find(
    (observation) => observation.smokeRunId !== input.smokeRunId
  );
  if (mismatchedDevice) {
    throw new Error(
      `SMOKE_RUN_ID_MISMATCH: ${mismatchedDevice.deviceClass} device evidence does not belong to the declared production smoke run.`
    );
  }
}

function stripSessionTags(input: V1ProductionSmokeSessionInputV1): V1ProductionSmokeInputV1 {
  return {
    releaseSha: input.releaseSha,
    generatedAt: input.generatedAt,
    environment: input.environment,
    observations: input.observations.map(({ smokeRunId: _smokeRunId, ...observation }) => observation),
    deviceObservations: input.deviceObservations.map(
      ({ smokeRunId: _smokeRunId, ...observation }) => observation
    )
  };
}

/**
 * Operational Useful V1 smoke entry point.
 *
 * The lower-level smoke compiler verifies routes, release SHA, freshness, device
 * coverage, provenance, and approval state. This boundary additionally requires
 * every route and device observation to belong to one explicit smoke run, so a
 * release cannot be certified by silently cherry-picking passing observations
 * from separate production sessions.
 *
 * This function performs no browser automation, network access, deployment,
 * mutation, approval, or inference. The run identifier is correlation metadata
 * only and does not make an observation true.
 */
export function compileSessionBoundV1ProductionSmokeV1(
  value: unknown
): V1ProductionSmokeResultV1 {
  const parsed = V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1.parse(value);
  assertSingleRun(parsed);
  return compileV1ProductionSmokeV1(stripSessionTags(parsed));
}

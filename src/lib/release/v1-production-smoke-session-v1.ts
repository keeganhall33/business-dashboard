import { z } from "zod";

import {
  V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  type V1ProductionSmokeDeviceObservationV1,
  type V1ProductionSmokeInputV1,
  type V1ProductionSmokeResultV1
} from "@/lib/release/v1-production-smoke-v1";
import { compileRuntimeV1ProductionSmokeV1 } from "@/lib/release/v1-production-smoke-runtime-v1";

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
    observedUrl: z.string(),
    evidenceRefs: z.array(z.string()).readonly(),
    releaseSha: z.string(),
    actionRequirement: actionRequirementSchema,
    detail: z.string().nullable().optional()
  })
  .strict();

const taggedDeviceSchema = z
  .object({
    smokeRunId: smokeRunIdSchema,
    stepId: stepIdSchema,
    deviceClass: deviceClassSchema,
    state: stepStateSchema,
    observedAt: z.string(),
    observedPath: z.string(),
    observedUrl: z.string(),
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

type TaggedDeviceObservationV1 = V1ProductionSmokeSessionInputV1["deviceObservations"][number];

function parsedTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function configuredProductionOrigin(): string {
  const configured =
    process.env.DASHBOARD_PRODUCTION_URL?.trim() || process.env.SMOKE_BASE_URL?.trim();
  if (!configured) {
    throw new Error(
      "SMOKE_PRODUCTION_ORIGIN_UNAVAILABLE: DASHBOARD_PRODUCTION_URL or SMOKE_BASE_URL must identify the governed production origin."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(
      "SMOKE_PRODUCTION_ORIGIN_INVALID: the configured production origin is not a valid URL."
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== "/"
  ) {
    throw new Error(
      "SMOKE_PRODUCTION_ORIGIN_INVALID: the configured production origin must be an HTTPS origin without credentials, path, query, or fragment."
    );
  }

  return parsed.origin;
}

function assertObservedProductionUrl(
  observedUrl: string,
  observedPath: string,
  expectedOrigin: string,
  label: string
): void {
  let parsed: URL;
  try {
    parsed = new URL(observedUrl);
  } catch {
    throw new Error(`SMOKE_PRODUCTION_URL_INVALID: ${label} did not record a valid absolute URL.`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      `SMOKE_PRODUCTION_URL_INVALID: ${label} must record a clean HTTPS production URL without credentials, query, or fragment.`
    );
  }
  if (parsed.origin !== expectedOrigin) {
    throw new Error(
      `SMOKE_PRODUCTION_ORIGIN_MISMATCH: ${label} was observed on a non-production origin.`
    );
  }
  if (parsed.pathname !== observedPath) {
    throw new Error(
      `SMOKE_PRODUCTION_PATH_MISMATCH: ${label} absolute URL does not match its declared observedPath.`
    );
  }
}

function assertProductionOriginBinding(
  input: V1ProductionSmokeSessionInputV1,
  expectedOrigin: string
): void {
  for (const observation of input.observations) {
    assertObservedProductionUrl(
      observation.observedUrl,
      observation.observedPath,
      expectedOrigin,
      observation.stepId
    );
  }

  for (const observation of input.deviceObservations) {
    assertObservedProductionUrl(
      observation.observedUrl,
      observation.observedPath,
      expectedOrigin,
      `${observation.deviceClass} ${observation.stepId}`
    );
  }
}

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
      `SMOKE_RUN_ID_MISMATCH: ${mismatchedDevice.deviceClass} ${mismatchedDevice.stepId} device evidence does not belong to the declared production smoke run.`
    );
  }
}

function assertDeviceObservationTruth(
  input: V1ProductionSmokeSessionInputV1,
  observation: TaggedDeviceObservationV1,
  expectedPath: string | null
): void {
  const label = `${observation.deviceClass} ${observation.stepId}`;

  if (expectedPath != null && observation.observedPath !== expectedPath) {
    throw new Error(
      `SMOKE_DEVICE_ROUTE_MISMATCH: ${label} observed ${observation.observedPath} instead of the route observation ${expectedPath}.`
    );
  }
  if (observation.state !== "PASS") {
    throw new Error(`SMOKE_DEVICE_ROUTE_NOT_PASS: ${label} is ${observation.state}.`);
  }
  if (observation.releaseSha !== input.releaseSha) {
    throw new Error(`SMOKE_DEVICE_ROUTE_SHA_MISMATCH: ${label} is not bound to the declared release SHA.`);
  }
  if (observation.actionRequirement !== "NONE") {
    throw new Error(
      `SMOKE_DEVICE_ROUTE_ACTION_REQUIRED: ${label} still requires ${observation.actionRequirement} action.`
    );
  }
  if (observation.evidenceRefs.map((ref) => ref.trim()).filter(Boolean).length === 0) {
    throw new Error(`SMOKE_DEVICE_ROUTE_MISSING_PROVENANCE: ${label} has no evidence reference.`);
  }

  const observedAtMs = parsedTimestamp(observation.observedAt);
  if (observedAtMs == null) {
    throw new Error(`SMOKE_DEVICE_ROUTE_INVALID_TIMESTAMP: ${label} observedAt is invalid.`);
  }
  const generatedAtMs = parsedTimestamp(input.generatedAt);
  if (generatedAtMs != null) {
    if (observedAtMs > generatedAtMs) {
      throw new Error(`SMOKE_DEVICE_ROUTE_FUTURE_EVIDENCE: ${label} is dated after smoke generation.`);
    }
    if (generatedAtMs - observedAtMs > V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1) {
      throw new Error(`SMOKE_DEVICE_ROUTE_STALE_EVIDENCE: ${label} is outside the smoke freshness window.`);
    }
  }

  const viewportIsBounded =
    Number.isInteger(observation.viewportWidth) &&
    Number.isInteger(observation.viewportHeight) &&
    observation.viewportWidth >= 240 &&
    observation.viewportHeight >= 240 &&
    observation.viewportWidth <= 8192 &&
    observation.viewportHeight <= 8192;
  if (!viewportIsBounded) {
    throw new Error(`SMOKE_DEVICE_ROUTE_INVALID_VIEWPORT: ${label} has invalid viewport dimensions.`);
  }

  const matchesClass = observation.deviceClass === "MOBILE"
    ? observation.viewportWidth <= 767
    : observation.viewportWidth >= 1024;
  if (!matchesClass) {
    throw new Error(
      `SMOKE_DEVICE_ROUTE_VIEWPORT_MISMATCH: ${label} viewport width does not match its device class.`
    );
  }
}

function compileCompleteDeviceRouteCoverage(
  input: V1ProductionSmokeSessionInputV1
): readonly V1ProductionSmokeDeviceObservationV1[] {
  const routeObservations = new Map<
    (typeof V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1)[number],
    V1ProductionSmokeSessionInputV1["observations"]
  >();
  for (const stepId of V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1) {
    routeObservations.set(
      stepId,
      input.observations.filter((observation) => observation.stepId === stepId)
    );
  }

  const compiled: V1ProductionSmokeDeviceObservationV1[] = [];

  for (const deviceClass of V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1) {
    const deviceEvidence: TaggedDeviceObservationV1[] = [];

    for (const stepId of V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1) {
      const matches = input.deviceObservations.filter(
        (observation) =>
          observation.deviceClass === deviceClass && observation.stepId === stepId
      );
      if (matches.length === 0) {
        throw new Error(
          `SMOKE_DEVICE_ROUTE_MISSING: ${deviceClass} has no ${stepId} production-route observation.`
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `SMOKE_DEVICE_ROUTE_DUPLICATE: ${deviceClass} has multiple ${stepId} production-route observations.`
        );
      }

      const routeMatches = routeObservations.get(stepId) ?? [];
      const expectedPath = routeMatches.length === 1 ? routeMatches[0].observedPath : null;
      assertDeviceObservationTruth(input, matches[0], expectedPath);
      deviceEvidence.push(matches[0]);
    }

    const first = deviceEvidence[0];
    const latest = [...deviceEvidence].sort(
      (left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt)
    )[0];

    compiled.push({
      deviceClass,
      state: "PASS",
      observedAt: latest.observedAt,
      viewportWidth: first.viewportWidth,
      viewportHeight: first.viewportHeight,
      evidenceRefs: [...new Set(deviceEvidence.flatMap((observation) => observation.evidenceRefs))],
      releaseSha: input.releaseSha,
      actionRequirement: "NONE",
      detail: `All ${V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.length} required production routes were observed on ${deviceClass} within one smoke run.`
    });
  }

  return compiled;
}

function stripSessionTags(input: V1ProductionSmokeSessionInputV1): V1ProductionSmokeInputV1 {
  return {
    releaseSha: input.releaseSha,
    generatedAt: input.generatedAt,
    environment: input.environment,
    observations: input.observations.map(
      ({ smokeRunId: _smokeRunId, observedUrl: _observedUrl, ...observation }) => observation
    ),
    deviceObservations: compileCompleteDeviceRouteCoverage(input)
  };
}

/**
 * Operational Useful V1 smoke entry point.
 *
 * The lower-level smoke compiler verifies routes, release SHA, freshness, provenance,
 * and approval state. This boundary additionally requires every route and every
 * desktop/mobile route observation to belong to one explicit smoke run and to the
 * configured HTTPS production origin. Device coherence is therefore proven across
 * the complete V1 acceptance path rather than by one unrelated viewport observation
 * per device class. The completed session is then evaluated by the runtime smoke
 * boundary so a caller-controlled generatedAt cannot replay an old but internally
 * coherent session as current production truth.
 *
 * This function performs no browser automation, network access, deployment,
 * mutation, approval, or inference. The run identifier is correlation metadata
 * only and does not make an observation true. The production-origin binding is
 * resolved from the governed runtime environment and fails closed when unavailable.
 */
export function compileSessionBoundV1ProductionSmokeV1(
  value: unknown
): V1ProductionSmokeResultV1 {
  const parsed = V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1.parse(value);
  const expectedProductionOrigin = configuredProductionOrigin();
  assertSingleRun(parsed);
  assertProductionOriginBinding(parsed, expectedProductionOrigin);
  return compileRuntimeV1ProductionSmokeV1(stripSessionTags(parsed));
}

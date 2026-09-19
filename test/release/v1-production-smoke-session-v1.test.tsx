import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1
} from "@/lib/release/v1-production-smoke-v1";
import {
  V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1,
  compileSessionBoundV1ProductionSmokeV1,
  type V1ProductionSmokeSessionInputV1
} from "@/lib/release/v1-production-smoke-session-v1";

const RELEASE_SHA = "be7110186228ef54ae3c0a15637f30025aada5da";
const GENERATED_AT = "2026-09-18T18:00:00.000Z";
const OBSERVED_AT = "2026-09-18T17:55:00.000Z";
const SMOKE_RUN_ID = "smoke-run-20260918-1755";

const TEST_PATHS: Record<(typeof V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1)[number], string> = {
  EXECUTIVE_HOME: "/dashboard",
  OPPORTUNITY_DETAIL: "/opportunities-actions/opportunity/opportunity-smoke-1",
  CRM_PERSON: "/relationships/people/person-smoke-1",
  CRM_COMPANY: "/relationships/companies/company-smoke-1",
  CRM_ACTIVITY: "/relationships/activity",
  STRATEGY: "/strategy",
  DATA_EVIDENCE: "/data-evidence",
  LEARNING: "/learning",
  EVENTS: "/events-market-windows",
  SPECIALISTS: "/specialists"
};

function validInput(): V1ProductionSmokeSessionInputV1 {
  return {
    smokeRunId: SMOKE_RUN_ID,
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    environment: "PRODUCTION",
    observations: V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.map((stepId) => ({
      smokeRunId: SMOKE_RUN_ID,
      stepId,
      state: "PASS" as const,
      observedAt: OBSERVED_AT,
      observedPath: TEST_PATHS[stepId],
      evidenceRefs: [`github://production-smoke/${SMOKE_RUN_ID}/${stepId.toLowerCase()}`],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE" as const
    })),
    deviceObservations: V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1.flatMap((deviceClass) =>
      V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.map((stepId) => ({
        smokeRunId: SMOKE_RUN_ID,
        stepId,
        deviceClass,
        state: "PASS" as const,
        observedAt: OBSERVED_AT,
        observedPath: TEST_PATHS[stepId],
        viewportWidth: deviceClass === "DESKTOP" ? 1440 : 390,
        viewportHeight: deviceClass === "DESKTOP" ? 900 : 844,
        evidenceRefs: [
          `github://production-smoke/${SMOKE_RUN_ID}/device/${deviceClass.toLowerCase()}/${stepId.toLowerCase()}`
        ],
        releaseSha: RELEASE_SHA,
        actionRequirement: "NONE" as const
      }))
    )
  };
}

test("one coherent exact-SHA production smoke session with full desktop/mobile route coverage can pass", () => {
  const result = compileSessionBoundV1ProductionSmokeV1(validInput());

  assert.equal(result.status, "PASS");
  assert.equal(result.gateEvidence.gateId, "PRODUCTION_SMOKE");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.deviceCoverage.length, 2);
  assert.ok(result.deviceCoverage.every((entry) => entry.status === "PASS"));
});

test("route evidence from another smoke session fails closed before certification", () => {
  const input = validInput();
  input.observations = input.observations.map((observation) =>
    observation.stepId === "LEARNING"
      ? { ...observation, smokeRunId: "smoke-run-other-session" }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_RUN_ID_MISMATCH: LEARNING/
  );
});

test("device evidence from another smoke session fails closed before certification", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((observation) =>
    observation.deviceClass === "MOBILE" && observation.stepId === "LEARNING"
      ? { ...observation, smokeRunId: "smoke-run-other-session" }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_RUN_ID_MISMATCH: MOBILE LEARNING/
  );
});

test("missing mobile coverage for one required route cannot be hidden by other mobile passes", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.filter(
    (observation) =>
      !(observation.deviceClass === "MOBILE" && observation.stepId === "DATA_EVIDENCE")
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_DEVICE_ROUTE_MISSING: MOBILE has no DATA_EVIDENCE/
  );
});

test("duplicate device coverage for a route fails closed instead of choosing a passing observation", () => {
  const input = validInput();
  const duplicate = input.deviceObservations.find(
    (observation) => observation.deviceClass === "DESKTOP" && observation.stepId === "STRATEGY"
  );
  assert.ok(duplicate);
  input.deviceObservations = [...input.deviceObservations, { ...duplicate }];

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_DEVICE_ROUTE_DUPLICATE: DESKTOP has multiple STRATEGY/
  );
});

test("device route evidence must prove the same canonical pathname as the route observation", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((observation) =>
    observation.deviceClass === "MOBILE" && observation.stepId === "STRATEGY"
      ? { ...observation, observedPath: "/learning" }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_DEVICE_ROUTE_MISMATCH: MOBILE STRATEGY/
  );
});

test("one stale device-route observation blocks the whole final smoke session", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((observation) =>
    observation.deviceClass === "DESKTOP" && observation.stepId === "EVENTS"
      ? { ...observation, observedAt: "2026-09-18T16:30:00.000Z" }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_DEVICE_ROUTE_STALE_EVIDENCE: DESKTOP EVENTS/
  );
});

test("one device-route observation with unresolved action cannot be averaged away", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((observation) =>
    observation.deviceClass === "MOBILE" && observation.stepId === "CRM_COMPANY"
      ? { ...observation, actionRequirement: "KEEGAN" as const }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_DEVICE_ROUTE_ACTION_REQUIRED: MOBILE CRM_COMPANY/
  );
});

test("run identifiers are opaque, bounded correlation metadata rather than secret or identity containers", () => {
  const unsafe = { ...validInput(), smokeRunId: "keegan@example.com" };
  assert.equal(V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1.safeParse(unsafe).success, false);

  const tooShort = { ...validInput(), smokeRunId: "run-1" };
  assert.equal(V1_PRODUCTION_SMOKE_SESSION_INPUT_SCHEMA_V1.safeParse(tooShort).success, false);
});

test("session binding does not weaken canonical route truth", () => {
  const input = validInput();
  input.observations = input.observations.map((observation) =>
    observation.stepId === "STRATEGY"
      ? { ...observation, observedPath: "/learning" }
      : observation
  );
  input.deviceObservations = input.deviceObservations.map((observation) =>
    observation.stepId === "STRATEGY"
      ? { ...observation, observedPath: "/learning" }
      : observation
  );

  const result = compileSessionBoundV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "STEP_ROUTE_MISMATCH" && blocker.stepId === "STRATEGY"
    )
  );
});

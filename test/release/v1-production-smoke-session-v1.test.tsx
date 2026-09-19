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
    deviceObservations: V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1.map((deviceClass) => ({
      smokeRunId: SMOKE_RUN_ID,
      deviceClass,
      state: "PASS" as const,
      observedAt: OBSERVED_AT,
      viewportWidth: deviceClass === "DESKTOP" ? 1440 : 390,
      viewportHeight: deviceClass === "DESKTOP" ? 900 : 844,
      evidenceRefs: [
        `github://production-smoke/${SMOKE_RUN_ID}/device/${deviceClass.toLowerCase()}`
      ],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE" as const
    }))
  };
}

test("one coherent exact-SHA production smoke session can satisfy the existing smoke gate", () => {
  const result = compileSessionBoundV1ProductionSmokeV1(validInput());

  assert.equal(result.status, "PASS");
  assert.equal(result.gateEvidence.gateId, "PRODUCTION_SMOKE");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.blockers.length, 0);
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
    observation.deviceClass === "MOBILE"
      ? { ...observation, smokeRunId: "smoke-run-other-session" }
      : observation
  );

  assert.throws(
    () => compileSessionBoundV1ProductionSmokeV1(input),
    /SMOKE_RUN_ID_MISMATCH: MOBILE/
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

  const result = compileSessionBoundV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (blocker) => blocker.code === "STEP_ROUTE_MISMATCH" && blocker.stepId === "STRATEGY"
    )
  );
});

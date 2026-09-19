import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";
import {
  V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
  type V1ProductionSmokeDeviceObservationV1,
  type V1ProductionSmokeInputV1,
  type V1ProductionSmokeObservationV1
} from "@/lib/release/v1-production-smoke-v1";
import {
  compileRuntimeV1ProductionSmokeV1,
  parseV1ProductionSmokeInputV1
} from "@/lib/release/v1-production-smoke-runtime-v1";

const RELEASE_SHA = "be7110186228ef54ae3c0a15637f30025aada5da";
const GENERATED_AT = "2026-09-18T18:00:00.000Z";
const OBSERVED_AT = "2026-09-18T17:55:00.000Z";

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

function validObservation(
  stepId: (typeof V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1)[number]
): V1ProductionSmokeObservationV1 {
  return {
    stepId,
    state: "PASS",
    observedAt: OBSERVED_AT,
    observedPath: TEST_PATHS[stepId],
    evidenceRefs: [`github://production-smoke/${stepId.toLowerCase()}`],
    releaseSha: RELEASE_SHA,
    actionRequirement: "NONE"
  };
}

function validDeviceObservation(
  deviceClass: (typeof V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1)[number]
): V1ProductionSmokeDeviceObservationV1 {
  return {
    deviceClass,
    state: "PASS",
    observedAt: OBSERVED_AT,
    viewportWidth: deviceClass === "DESKTOP" ? 1440 : 390,
    viewportHeight: deviceClass === "DESKTOP" ? 900 : 844,
    evidenceRefs: [`github://production-smoke/device/${deviceClass.toLowerCase()}`],
    releaseSha: RELEASE_SHA,
    actionRequirement: "NONE"
  };
}

function validInput(): V1ProductionSmokeInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    environment: "PRODUCTION",
    observations: V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.map(validObservation),
    deviceObservations: V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1.map(validDeviceObservation)
  };
}

test("all required exact-SHA canonical production observations plus desktop/mobile coverage compile to PRODUCTION_SMOKE PASS evidence", () => {
  const result = compileV1ProductionSmokeV1(validInput());

  assert.equal(result.status, "PASS");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gateEvidence.gateId, "PRODUCTION_SMOKE");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.equal(result.steps.every((step) => step.status === "PASS"), true);
  assert.equal(result.deviceCoverage.every((device) => device.status === "PASS"), true);
  assert.equal(result.authority.canDeploy, false);
  assert.equal(result.authority.canMutateProduction, false);
  assert.equal(result.authority.canSendEmail, false);
  assert.equal(result.authority.canBypassApproval, false);
});

test("canonical smoke gate can be consumed directly by the existing V1 release certificate", () => {
  const smoke = compileV1ProductionSmokeV1(validInput());
  const gates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.map((gateId) =>
    gateId === "PRODUCTION_SMOKE"
      ? smoke.gateEvidence
      : {
          gateId,
          state: "PASS",
          freshness: "CURRENT",
          observedAt: OBSERVED_AT,
          evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
          releaseSha: RELEASE_SHA,
          actionRequirement: "NONE"
        }
  );

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.certifiedClaims.productionSmoke, true);
  assert.equal(certificate.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
});

test("missing route observations fail closed", () => {
  const input = validInput();
  input.observations = input.observations.filter((entry) => entry.stepId !== "SPECIALISTS");

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "MISSING_STEP" && entry.stepId === "SPECIALISTS"
    )
  );
  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
});

test("duplicate route observations fail closed rather than choosing a winner", () => {
  const input = validInput();
  input.observations = [...input.observations, validObservation("EXECUTIVE_HOME")];

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "DUPLICATE_STEP" && entry.stepId === "EXECUTIVE_HOME"
    )
  );
});

test("complete route observations in the wrong acceptance-path order fail closed", () => {
  const input = validInput();
  const observations = [...input.observations];
  [observations[0], observations[1]] = [observations[1], observations[0]];
  input.observations = observations;

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_OUT_OF_ORDER"));
});

test("a route step bound to a different release SHA cannot certify production smoke", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "STRATEGY"
      ? { ...entry, releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_SHA_MISMATCH" && entry.stepId === "STRATEGY"
    )
  );
});

test("future-dated route observations cannot become current smoke evidence", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "LEARNING"
      ? { ...entry, observedAt: "2026-09-18T18:01:00.000Z" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_FUTURE_EVIDENCE" && entry.stepId === "LEARNING"
    )
  );
});

test("stale route observations cannot be replayed as current smoke evidence", () => {
  const input = validInput();
  const staleObservedAt = new Date(
    Date.parse(GENERATED_AT) - V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1 - 1
  ).toISOString();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "EXECUTIVE_HOME" ? { ...entry, observedAt: staleObservedAt } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_STALE_EVIDENCE" && entry.stepId === "EXECUTIVE_HOME"
    )
  );
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
});

test("the one-hour production-smoke freshness boundary is inclusive", () => {
  const input = validInput();
  const boundaryObservedAt = new Date(
    Date.parse(GENERATED_AT) - V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1
  ).toISOString();
  input.observations = input.observations.map((entry) => ({
    ...entry,
    observedAt: boundaryObservedAt
  }));
  input.deviceObservations = input.deviceObservations.map((entry) => ({
    ...entry,
    observedAt: boundaryObservedAt
  }));

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
});

test("non-pass route state or outstanding action remains blocking", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "CRM_ACTIVITY"
      ? { ...entry, state: "BLOCKED", actionRequirement: "KEEGAN" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_NOT_PASS" && entry.stepId === "CRM_ACTIVITY"
    )
  );
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_ACTION_REQUIRED" && entry.stepId === "CRM_ACTIVITY"
    )
  );
  assert.equal(result.gateEvidence.actionRequirement, "KEEGAN");
});

test("observed paths must be privacy-safe pathnames without query strings or fragments", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "CRM_PERSON"
      ? { ...entry, observedPath: "/relationships/people/person-1?email=private@example.com" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_INVALID_PATH" && entry.stepId === "CRM_PERSON"
    )
  );
  assert.equal(result.steps.find((entry) => entry.stepId === "CRM_PERSON")?.observedPath, null);
});

test("arbitrary safe pathnames cannot masquerade as canonical smoke steps", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "EXECUTIVE_HOME"
      ? { ...entry, observedPath: "/smoke/executive-home" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_ROUTE_MISMATCH" && entry.stepId === "EXECUTIVE_HOME"
    )
  );
  assert.equal(
    result.steps.find((entry) => entry.stepId === "EXECUTIVE_HOME")?.observedPath,
    null
  );
  assert.equal(result.gateEvidence.state, "BLOCKED");
});

test("a canonical step cannot be satisfied by another canonical route", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "STRATEGY" ? { ...entry, observedPath: "/learning" } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_ROUTE_MISMATCH" && entry.stepId === "STRATEGY"
    )
  );
});

test("dynamic smoke routes require one opaque identifier segment", () => {
  const missingId = validInput();
  missingId.observations = missingId.observations.map((entry) =>
    entry.stepId === "CRM_COMPANY"
      ? { ...entry, observedPath: "/relationships/companies" }
      : entry
  );
  const missingIdResult = compileV1ProductionSmokeV1(missingId);
  assert.equal(missingIdResult.status, "BLOCKED");
  assert.ok(
    missingIdResult.blockers.some(
      (entry) => entry.code === "STEP_ROUTE_MISMATCH" && entry.stepId === "CRM_COMPANY"
    )
  );

  const unsafeId = validInput();
  unsafeId.observations = unsafeId.observations.map((entry) =>
    entry.stepId === "CRM_PERSON"
      ? { ...entry, observedPath: "/relationships/people/private@example.com" }
      : entry
  );
  const unsafeIdResult = compileV1ProductionSmokeV1(unsafeId);
  assert.equal(unsafeIdResult.status, "BLOCKED");
  assert.ok(
    unsafeIdResult.blockers.some(
      (entry) => entry.code === "STEP_ROUTE_MISMATCH" && entry.stepId === "CRM_PERSON"
    )
  );
});

test("desktop and mobile device coverage are both mandatory", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.filter(
    (entry) => entry.deviceClass !== "MOBILE"
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "MISSING_DEVICE_COVERAGE"));
  assert.equal(
    result.deviceCoverage.find((entry) => entry.deviceClass === "MOBILE")?.state,
    "MISSING"
  );
  assert.equal(result.gateEvidence.state, "BLOCKED");
});

test("duplicate device observations fail closed rather than choosing a winner", () => {
  const input = validInput();
  input.deviceObservations = [
    ...input.deviceObservations,
    validDeviceObservation("DESKTOP")
  ];

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DUPLICATE_DEVICE_COVERAGE"));
});

test("device coverage is exact-SHA bound", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((entry) =>
    entry.deviceClass === "MOBILE"
      ? { ...entry, releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_SHA_MISMATCH"));
});

test("device labels must match evidence-backed viewport classes", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((entry) =>
    entry.deviceClass === "MOBILE" ? { ...entry, viewportWidth: 1440 } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_VIEWPORT_MISMATCH"));
});

test("non-pass device coherence or outstanding action remains blocking", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((entry) =>
    entry.deviceClass === "MOBILE"
      ? { ...entry, state: "BLOCKED", actionRequirement: "KEEGAN" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_NOT_PASS"));
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_ACTION_REQUIRED"));
  assert.equal(result.gateEvidence.actionRequirement, "KEEGAN");
});

test("future-dated or secret-like device evidence fails closed and is sanitized", () => {
  const input = validInput();
  input.deviceObservations = input.deviceObservations.map((entry) =>
    entry.deviceClass === "DESKTOP"
      ? {
          ...entry,
          observedAt: "2026-09-18T18:01:00.000Z",
          evidenceRefs: ["token=do-not-persist"]
        }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_FUTURE_EVIDENCE"));
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_UNSAFE_PROVENANCE"));
  assert.deepEqual(
    result.deviceCoverage.find((entry) => entry.deviceClass === "DESKTOP")?.evidenceRefs,
    []
  );
  assert.equal(JSON.stringify(result).includes("do-not-persist"), false);
});

test("stale device observations cannot be replayed as current smoke evidence", () => {
  const input = validInput();
  const staleObservedAt = new Date(
    Date.parse(GENERATED_AT) - V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1 - 1
  ).toISOString();
  input.deviceObservations = input.deviceObservations.map((entry) =>
    entry.deviceClass === "MOBILE" ? { ...entry, observedAt: staleObservedAt } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DEVICE_STALE_EVIDENCE"));
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
});

test("secret-like route provenance is removed and blocks certification", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "DATA_EVIDENCE"
      ? { ...entry, evidenceRefs: ["token=do-not-persist"] }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  const step = result.steps.find((entry) => entry.stepId === "DATA_EVIDENCE");
  assert.equal(result.status, "BLOCKED");
  assert.ok(
    result.blockers.some(
      (entry) => entry.code === "STEP_UNSAFE_PROVENANCE" && entry.stepId === "DATA_EVIDENCE"
    )
  );
  assert.deepEqual(step?.evidenceRefs, []);
  assert.equal(JSON.stringify(result).includes("do-not-persist"), false);
});

test("runtime parsing rejects unknown steps/device classes, missing device coverage, non-production environments, and extra truth fields", () => {
  const unknownStep = JSON.parse(JSON.stringify(validInput())) as {
    observations: Array<Record<string, unknown>>;
  };
  unknownStep.observations[0] = { ...unknownStep.observations[0], stepId: "UNDECLARED_STEP" };
  assert.throws(() => parseV1ProductionSmokeInputV1(unknownStep));

  const unknownDevice = JSON.parse(JSON.stringify(validInput())) as {
    deviceObservations: Array<Record<string, unknown>>;
  };
  unknownDevice.deviceObservations[0] = {
    ...unknownDevice.deviceObservations[0],
    deviceClass: "TABLET"
  };
  assert.throws(() => parseV1ProductionSmokeInputV1(unknownDevice));

  const missingDeviceCoverage = JSON.parse(JSON.stringify(validInput())) as Record<string, unknown>;
  delete missingDeviceCoverage.deviceObservations;
  assert.throws(() => parseV1ProductionSmokeInputV1(missingDeviceCoverage));

  const wrongEnvironment = { ...validInput(), environment: "STAGING" };
  assert.throws(() => compileRuntimeV1ProductionSmokeV1(wrongEnvironment));

  const extraTruthField = { ...validInput(), productionReady: true };
  assert.throws(() => parseV1ProductionSmokeInputV1(extraTruthField));
});

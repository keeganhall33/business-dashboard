import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";
import {
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
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
  EXECUTIVE_HOME: "/smoke/executive-home",
  OPPORTUNITY_DETAIL: "/smoke/opportunity-detail",
  CRM_PERSON: "/smoke/crm-person",
  CRM_COMPANY: "/smoke/crm-company",
  CRM_ACTIVITY: "/smoke/crm-activity",
  STRATEGY: "/smoke/strategy",
  DATA_EVIDENCE: "/smoke/data-evidence",
  LEARNING: "/smoke/learning",
  EVENTS: "/smoke/events",
  SPECIALISTS: "/smoke/specialists"
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

function validInput(): V1ProductionSmokeInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt: GENERATED_AT,
    environment: "PRODUCTION",
    observations: V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.map(validObservation)
  };
}

test("all required exact-SHA production observations compile to canonical PRODUCTION_SMOKE PASS evidence", () => {
  const result = compileV1ProductionSmokeV1(validInput());

  assert.equal(result.status, "PASS");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.gateEvidence.gateId, "PRODUCTION_SMOKE");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.equal(result.steps.every((step) => step.status === "PASS"), true);
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

test("missing observations fail closed", () => {
  const input = validInput();
  input.observations = input.observations.filter((entry) => entry.stepId !== "SPECIALISTS");

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "MISSING_STEP" && entry.stepId === "SPECIALISTS"));
  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
});

test("duplicate observations fail closed rather than choosing a winner", () => {
  const input = validInput();
  input.observations = [...input.observations, validObservation("EXECUTIVE_HOME")];

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "DUPLICATE_STEP" && entry.stepId === "EXECUTIVE_HOME"));
});

test("complete observations in the wrong acceptance-path order fail closed", () => {
  const input = validInput();
  const observations = [...input.observations];
  [observations[0], observations[1]] = [observations[1], observations[0]];
  input.observations = observations;

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_OUT_OF_ORDER"));
});

test("a step bound to a different release SHA cannot certify the production release", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "STRATEGY"
      ? { ...entry, releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_SHA_MISMATCH" && entry.stepId === "STRATEGY"));
});

test("future-dated observations cannot become current smoke evidence", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "LEARNING" ? { ...entry, observedAt: "2026-09-18T18:01:00.000Z" } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_FUTURE_EVIDENCE" && entry.stepId === "LEARNING"));
});

test("non-pass state or outstanding action remains blocking", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "CRM_ACTIVITY"
      ? { ...entry, state: "BLOCKED", actionRequirement: "KEEGAN" }
      : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_NOT_PASS" && entry.stepId === "CRM_ACTIVITY"));
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_ACTION_REQUIRED" && entry.stepId === "CRM_ACTIVITY"));
  assert.equal(result.gateEvidence.actionRequirement, "KEEGAN");
});

test("observed paths must be privacy-safe pathnames without query strings or fragments", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "CRM_PERSON" ? { ...entry, observedPath: "/crm/person?email=private@example.com" } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_INVALID_PATH" && entry.stepId === "CRM_PERSON"));
  assert.equal(result.steps.find((entry) => entry.stepId === "CRM_PERSON")?.observedPath, null);
});

test("secret-like provenance is removed and blocks certification", () => {
  const input = validInput();
  input.observations = input.observations.map((entry) =>
    entry.stepId === "DATA_EVIDENCE" ? { ...entry, evidenceRefs: ["token=do-not-persist"] } : entry
  );

  const result = compileV1ProductionSmokeV1(input);
  const step = result.steps.find((entry) => entry.stepId === "DATA_EVIDENCE");
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "STEP_UNSAFE_PROVENANCE" && entry.stepId === "DATA_EVIDENCE"));
  assert.deepEqual(step?.evidenceRefs, []);
  assert.equal(JSON.stringify(result).includes("do-not-persist"), false);
});

test("runtime parsing rejects unknown steps, non-production environments, and extra truth fields", () => {
  const unknownStep = JSON.parse(JSON.stringify(validInput())) as {
    observations: Array<Record<string, unknown>>;
  };
  unknownStep.observations[0] = { ...unknownStep.observations[0], stepId: "UNDECLARED_STEP" };
  assert.throws(() => parseV1ProductionSmokeInputV1(unknownStep));

  const wrongEnvironment = { ...validInput(), environment: "STAGING" };
  assert.throws(() => compileRuntimeV1ProductionSmokeV1(wrongEnvironment));

  const extraTruthField = { ...validInput(), productionReady: true };
  assert.throws(() => parseV1ProductionSmokeInputV1(extraTruthField));
});

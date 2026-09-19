import assert from "node:assert/strict";
import test from "node:test";

import {
  V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1,
  V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1,
  compileV1ProductionSmokeV1,
  type V1ProductionSmokeInputV1
} from "@/lib/release/v1-production-smoke-v1";
import { compileRuntimeV1ProductionSmokeV1 } from "@/lib/release/v1-production-smoke-runtime-v1";

const RELEASE_SHA = "be7110186228ef54ae3c0a15637f30025aada5da";

const TEST_PATHS: Record<(typeof V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1)[number], string> = {
  EXECUTIVE_HOME: "/dashboard",
  OPPORTUNITY_DETAIL: "/opportunities-actions/opportunity/opportunity-smoke-runtime",
  CRM_PERSON: "/relationships/people/person-smoke-runtime",
  CRM_COMPANY: "/relationships/companies/company-smoke-runtime",
  CRM_ACTIVITY: "/relationships/activity",
  STRATEGY: "/strategy",
  DATA_EVIDENCE: "/data-evidence",
  LEARNING: "/learning",
  EVENTS: "/events-market-windows",
  SPECIALISTS: "/specialists"
};

function smokeInput(observedAt: string, generatedAt: string): V1ProductionSmokeInputV1 {
  return {
    releaseSha: RELEASE_SHA,
    generatedAt,
    environment: "PRODUCTION",
    observations: V1_PRODUCTION_SMOKE_REQUIRED_STEPS_V1.map((stepId) => ({
      stepId,
      state: "PASS" as const,
      observedAt,
      observedPath: TEST_PATHS[stepId],
      evidenceRefs: [`github://production-smoke/runtime/${stepId.toLowerCase()}`],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE" as const
    })),
    deviceObservations: V1_PRODUCTION_SMOKE_REQUIRED_DEVICE_CLASSES_V1.map((deviceClass) => ({
      deviceClass,
      state: "PASS" as const,
      observedAt,
      viewportWidth: deviceClass === "DESKTOP" ? 1440 : 390,
      viewportHeight: deviceClass === "DESKTOP" ? 900 : 844,
      evidenceRefs: [`github://production-smoke/runtime/device/${deviceClass.toLowerCase()}`],
      releaseSha: RELEASE_SHA,
      actionRequirement: "NONE" as const
    }))
  };
}

test("runtime smoke cannot replay old observations by freezing caller generatedAt", () => {
  const runtimeNowMs = Date.now();
  const observedAtMs = runtimeNowMs - V1_PRODUCTION_SMOKE_MAX_OBSERVATION_AGE_MS_V1 - 10 * 60 * 1_000;
  const generatedAtMs = observedAtMs + 5 * 60 * 1_000;
  const input = smokeInput(
    new Date(observedAtMs).toISOString(),
    new Date(generatedAtMs).toISOString()
  );
  const before = JSON.stringify(input);

  // The deterministic compiler intentionally evaluates the artifact against its own
  // generatedAt and therefore accepts this internally coherent historical snapshot.
  const deterministic = compileV1ProductionSmokeV1(input);
  assert.equal(deterministic.status, "PASS");

  // The runtime boundary must additionally prove that the live observations are still
  // current now rather than trusting the replayed artifact clock.
  const runtime = compileRuntimeV1ProductionSmokeV1(input);

  assert.equal(runtime.status, "BLOCKED");
  assert.equal(runtime.gateEvidence.state, "BLOCKED");
  assert.equal(runtime.gateEvidence.freshness, "UNKNOWN");
  assert.equal(runtime.authority.canDeploy, false);
  assert.equal(runtime.authority.canMutateProduction, false);
  assert.ok(runtime.blockers.some((entry) => entry.code === "STEP_STALE_EVIDENCE"));
  assert.ok(runtime.blockers.some((entry) => entry.code === "DEVICE_STALE_EVIDENCE"));
  assert.ok(runtime.steps.every((entry) => entry.status === "BLOCKING"));
  assert.ok(runtime.deviceCoverage.every((entry) => entry.status === "BLOCKING"));
  assert.equal(JSON.stringify(input), before);
});

test("runtime smoke rejects evidence that is future-dated relative to the real clock", () => {
  const runtimeNowMs = Date.now();
  const observedAtMs = runtimeNowMs + 5 * 60 * 1_000;
  const generatedAtMs = runtimeNowMs + 10 * 60 * 1_000;
  const input = smokeInput(
    new Date(observedAtMs).toISOString(),
    new Date(generatedAtMs).toISOString()
  );

  assert.equal(compileV1ProductionSmokeV1(input).status, "PASS");

  const runtime = compileRuntimeV1ProductionSmokeV1(input);
  assert.equal(runtime.status, "BLOCKED");
  assert.ok(runtime.blockers.some((entry) => entry.code === "STEP_FUTURE_EVIDENCE"));
  assert.ok(runtime.blockers.some((entry) => entry.code === "DEVICE_FUTURE_EVIDENCE"));
  assert.equal(runtime.gateEvidence.freshness, "UNKNOWN");
});

test("fresh exact-SHA runtime smoke remains passable without adding authority", () => {
  const runtimeNowMs = Date.now();
  const observedAtMs = runtimeNowMs - 5 * 60 * 1_000;
  const generatedAtMs = runtimeNowMs - 60 * 1_000;
  const input = smokeInput(
    new Date(observedAtMs).toISOString(),
    new Date(generatedAtMs).toISOString()
  );

  // generatedAt must not precede observation time for the deterministic compiler.
  input.generatedAt = new Date(runtimeNowMs).toISOString();

  const runtime = compileRuntimeV1ProductionSmokeV1(input);
  assert.equal(runtime.status, "PASS");
  assert.equal(runtime.gateEvidence.state, "PASS");
  assert.equal(runtime.gateEvidence.freshness, "CURRENT");
  assert.equal(runtime.authority.canDeploy, false);
  assert.equal(runtime.authority.canMutateProduction, false);
  assert.equal(runtime.authority.canSendEmail, false);
  assert.equal(runtime.authority.canBypassApproval, false);
});

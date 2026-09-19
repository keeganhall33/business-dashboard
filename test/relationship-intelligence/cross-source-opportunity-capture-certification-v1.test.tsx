import assert from "node:assert/strict";
import test from "node:test";

import {
  bindCrossSourceOpportunityObservationsV1,
  type CrossSourceOpportunityBindingEvidenceV1
} from "@/lib/relationship-intelligence/cross-source-opportunity-binding-v1";
import {
  certifyCrossSourceOpportunityCaptureV1
} from "@/lib/relationship-intelligence/cross-source-opportunity-capture-certification-v1";
import {
  normalizeOpportunitySignalsV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const GENERATED_AT = "2026-09-19T10:00:00.000Z";
const AUDITED_AT = "2026-09-19T10:05:00.000Z";

function observation(
  sourceKind: "BOARDROOM" | "CHATGPT" | "EMAIL",
  event: string,
  overrides: Partial<OpportunitySourceObservationV1> = {}
): OpportunitySourceObservationV1 {
  return {
    captureId: `capture:${sourceKind.toLowerCase()}:${event}`,
    sourceKind,
    sourceEventKey: `${sourceKind.toLowerCase()}:${event}`,
    sourceRef: `${sourceKind.toLowerCase()}:source:${event}`,
    observedAt: "2026-09-19T09:30:00.000Z",
    evidenceRefs: [`ev:${sourceKind.toLowerCase()}:${event}`],
    truthState: "KNOWN",
    signalType: "PARTNERSHIP_OPPORTUNITY",
    organizationRef: "org:brand-a",
    ...overrides
  };
}

function binding(
  sourceKind: "BOARDROOM" | "CHATGPT" | "EMAIL",
  event: string,
  overrides: Partial<CrossSourceOpportunityBindingEvidenceV1> = {}
): CrossSourceOpportunityBindingEvidenceV1 {
  return {
    bindingId: `binding:${sourceKind.toLowerCase()}:${event}`,
    sourceKind,
    sourceEventKey: `${sourceKind.toLowerCase()}:${event}`,
    canonicalOpportunityRef: "opportunity:canonical-1",
    observedAt: "2026-09-19T09:45:00.000Z",
    truthState: "KNOWN",
    basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING",
    evidenceRefs: [`ev:binding:${sourceKind.toLowerCase()}:${event}`],
    expectedOrganizationRef: "org:brand-a",
    ...overrides
  };
}

function validPipeline() {
  const bindingResult = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: GENERATED_AT,
    maximumBindingAgeMinutes: 60,
    observations: [
      observation("BOARDROOM", "1"),
      observation("CHATGPT", "1"),
      observation("EMAIL", "1")
    ],
    bindings: [
      binding("BOARDROOM", "1"),
      binding("CHATGPT", "1"),
      binding("EMAIL", "1")
    ]
  });
  const intakeResult = normalizeOpportunitySignalsV1({
    evaluatedAt: GENERATED_AT,
    observations: bindingResult.observations
  });
  return { bindingResult, intakeResult };
}

test("certifies exact Boardroom, ChatGPT, and email convergence without converting source count to confidence", () => {
  const pipeline = validPipeline();
  const result = certifyCrossSourceOpportunityCaptureV1({
    ...pipeline,
    evaluatedAt: AUDITED_AT,
    maximumArtifactAgeMinutes: 60
  });

  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(result.issues, []);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].canonicalOpportunityRef, "opportunity:canonical-1");
  assert.equal(result.records[0].disposition, "MULTI_SOURCE_CAPTURED");
  assert.deepEqual(result.records[0].sourceKinds, ["BOARDROOM", "CHATGPT", "EMAIL"]);
  assert.equal(result.records[0].opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.records[0].confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.equal(result.records[0].monetaryValue, null);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("fails closed when a supplied intake result drifts from recomputation", () => {
  const pipeline = validPipeline();
  const forged = {
    ...pipeline.intakeResult,
    decisions: pipeline.intakeResult.decisions.map((decision) => ({
      ...decision,
      sourceKinds: ["BOARDROOM"] as const
    }))
  };

  const result = certifyCrossSourceOpportunityCaptureV1({
    bindingResult: pipeline.bindingResult,
    intakeResult: forged,
    evaluatedAt: AUDITED_AT,
    maximumArtifactAgeMinutes: 60
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("INTAKE_RESULT_DRIFT"));
  assert.deepEqual(result.records, []);
});

test("does not allow a verification-required binding to mutate the canonical opportunity", () => {
  const source = observation("EMAIL", "verify", { opportunityRef: null });
  const bindingResult = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: GENERATED_AT,
    maximumBindingAgeMinutes: 60,
    observations: [source],
    bindings: [binding("EMAIL", "verify", { expectedOrganizationRef: "org:different-brand" })]
  });
  assert.equal(bindingResult.records[0].disposition, "VERIFY_REQUIRED");
  assert.equal(bindingResult.observations[0].opportunityRef, null);

  const intakeResult = normalizeOpportunitySignalsV1({
    evaluatedAt: GENERATED_AT,
    observations: bindingResult.observations
  });
  const result = certifyCrossSourceOpportunityCaptureV1({
    bindingResult,
    intakeResult,
    evaluatedAt: AUDITED_AT,
    maximumArtifactAgeMinutes: 60
  });

  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(result.records, []);
  assert.equal(result.sourceCountConfidence, "NOT_ESTABLISHED");
});

test("blocks stale or future pipeline artifacts rather than treating old capture proof as current", () => {
  const pipeline = validPipeline();
  const stale = certifyCrossSourceOpportunityCaptureV1({
    ...pipeline,
    evaluatedAt: "2026-09-19T12:30:00.000Z",
    maximumArtifactAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("BINDING_ARTIFACT_STALE"));
  assert.ok(stale.issues.includes("INTAKE_ARTIFACT_STALE"));

  const future = certifyCrossSourceOpportunityCaptureV1({
    ...pipeline,
    evaluatedAt: "2026-09-19T09:59:00.000Z",
    maximumArtifactAgeMinutes: 60
  });
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("BINDING_ARTIFACT_FROM_FUTURE"));
  assert.ok(future.issues.includes("INTAKE_ARTIFACT_FROM_FUTURE"));
});

test("keeps conflicting canonical organization evidence in verification rather than selecting an identity", () => {
  const bindingResult = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: GENERATED_AT,
    maximumBindingAgeMinutes: 60,
    observations: [
      observation("BOARDROOM", "conflict-a", { organizationRef: "org:brand-a" }),
      observation("EMAIL", "conflict-b", { organizationRef: "org:brand-b" })
    ],
    bindings: [
      binding("BOARDROOM", "conflict-a", { expectedOrganizationRef: "org:brand-a" }),
      binding("EMAIL", "conflict-b", { expectedOrganizationRef: "org:brand-b" })
    ]
  });
  const intakeResult = normalizeOpportunitySignalsV1({
    evaluatedAt: GENERATED_AT,
    observations: bindingResult.observations
  });
  assert.equal(intakeResult.decisions[0].disposition, "VERIFY_REQUIRED");

  const result = certifyCrossSourceOpportunityCaptureV1({
    bindingResult,
    intakeResult,
    evaluatedAt: AUDITED_AT,
    maximumArtifactAgeMinutes: 60
  });

  assert.equal(result.status, "VERIFIED");
  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.records[0].canonicalOrganizationRef, null);
  assert.equal(result.records[0].confidenceFromSourceCount, "NOT_ESTABLISHED");
});

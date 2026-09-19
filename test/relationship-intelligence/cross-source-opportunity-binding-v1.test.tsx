import assert from "node:assert/strict";
import test from "node:test";

import {
  bindCrossSourceOpportunityObservationsV1,
  type CrossSourceOpportunityBindingEvidenceV1
} from "@/lib/relationship-intelligence/cross-source-opportunity-binding-v1";
import {
  normalizeOpportunitySignalsV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const EVALUATED_AT = "2026-09-18T23:30:00.000Z";

function observation(
  sourceKind: OpportunitySourceObservationV1["sourceKind"],
  sourceEventKey: string,
  overrides: Partial<OpportunitySourceObservationV1> = {}
): OpportunitySourceObservationV1 {
  return {
    captureId: `capture:${sourceKind.toLowerCase()}:${sourceEventKey}`,
    sourceKind,
    sourceEventKey,
    sourceRef: `${sourceKind.toLowerCase()}:ref:${sourceEventKey}`,
    observedAt: "2026-09-18T22:00:00.000Z",
    evidenceRefs: [`ev:${sourceKind.toLowerCase()}:${sourceEventKey}`],
    truthState: "KNOWN",
    signalType: "PARTNERSHIP_OPPORTUNITY",
    organizationRef: "org:brand-a",
    ...overrides
  };
}

function binding(
  sourceKind: CrossSourceOpportunityBindingEvidenceV1["sourceKind"],
  sourceEventKey: string,
  overrides: Partial<CrossSourceOpportunityBindingEvidenceV1> = {}
): CrossSourceOpportunityBindingEvidenceV1 {
  return {
    bindingId: `binding:${sourceKind.toLowerCase()}:${sourceEventKey}`,
    sourceKind,
    sourceEventKey,
    canonicalOpportunityRef: "opportunity:canonical-a",
    observedAt: "2026-09-18T23:00:00.000Z",
    truthState: "KNOWN",
    basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING",
    evidenceRefs: [`ev:binding:${sourceKind.toLowerCase()}:${sourceEventKey}`],
    expectedOrganizationRef: "org:brand-a",
    ...overrides
  };
}

test("explicit exact bindings converge Boardroom, ChatGPT, and email into one canonical intake opportunity", () => {
  const observations = [
    observation("BOARDROOM", "story-1"),
    observation("CHATGPT", "handoff-1"),
    observation("EMAIL", "message-1")
  ];
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations,
    bindings: [
      binding("BOARDROOM", "story-1"),
      binding("CHATGPT", "handoff-1"),
      binding("EMAIL", "message-1")
    ],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.status, "READY");
  assert.equal(result.records.length, 3);
  assert.ok(result.records.every((record) => record.disposition === "BOUND"));
  assert.ok(result.records.every((record) => record.projectedOpportunityRef === "opportunity:canonical-a"));

  const intake = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: result.observations,
    maximumSignalAgeDays: 1
  });
  assert.equal(intake.decisions.length, 1);
  assert.equal(intake.decisions[0].canonicalOpportunityRef, "opportunity:canonical-a");
  assert.deepEqual(intake.decisions[0].sourceKinds, ["BOARDROOM", "CHATGPT", "EMAIL"]);
  assert.equal(intake.decisions[0].confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.equal(intake.decisions[0].opportunityCertainty, "NOT_ESTABLISHED");
});

test("missing binding evidence preserves separate source events instead of guessing from the same organization", () => {
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [
      observation("BOARDROOM", "story-1"),
      observation("EMAIL", "message-1")
    ],
    bindings: [],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.status, "READY");
  assert.ok(result.records.every((record) => record.disposition === "UNBOUND"));
  assert.ok(result.observations.every((item) => item.opportunityRef == null));

  const intake = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: result.observations,
    maximumSignalAgeDays: 1
  });
  assert.equal(intake.decisions.length, 2);
  assert.equal(result.unboundPolicy, "PRESERVE_SOURCE_EVENT_WITHOUT_GUESSING");
});

test("partial or conflicted binding evidence requires verification and is never applied", () => {
  for (const truthState of ["PARTIAL", "CONFLICTED"] as const) {
    const result = bindCrossSourceOpportunityObservationsV1({
      evaluatedAt: EVALUATED_AT,
      observations: [observation("BOARDROOM", "story-1")],
      bindings: [binding("BOARDROOM", "story-1", { truthState })],
      maximumBindingAgeMinutes: 120
    });
    assert.equal(result.status, "READY");
    assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
    assert.equal(result.observations[0].opportunityRef, null);
    assert.ok(result.records[0].reasonCodes.includes(`BINDING_TRUTH_${truthState}`));
  }
});

test("stale or future binding evidence requires verification without changing source truth", () => {
  const stale = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("BOARDROOM", "story-1", { truthState: "PARTIAL" })],
    bindings: [binding("BOARDROOM", "story-1", { observedAt: "2026-09-18T20:00:00.000Z" })],
    maximumBindingAgeMinutes: 30
  });
  assert.equal(stale.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(stale.records[0].reasonCodes.includes("BINDING_EVIDENCE_STALE"));
  assert.equal(stale.observations[0].truthState, "PARTIAL");

  const future = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("BOARDROOM", "story-1")],
    bindings: [binding("BOARDROOM", "story-1", { observedAt: "2026-09-19T00:00:00.000Z" })],
    maximumBindingAgeMinutes: 120
  });
  assert.equal(future.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(future.records[0].reasonCodes.includes("BINDING_OBSERVED_IN_FUTURE"));
  assert.equal(future.observations[0].opportunityRef, null);
});

test("an existing different canonical opportunity ref conflicts instead of being overwritten", () => {
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("EMAIL", "message-1", { opportunityRef: "opportunity:existing-b" })],
    bindings: [binding("EMAIL", "message-1")],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.records[0].reasonCodes.includes("EXISTING_CANONICAL_OPPORTUNITY_REF_CONFLICT"));
  assert.equal(result.records[0].projectedOpportunityRef, "opportunity:existing-b");
  assert.equal(result.observations[0].opportunityRef, "opportunity:existing-b");
});

test("exact organization and person expectations fail closed on identity disagreement", () => {
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("EMAIL", "message-1", { personRef: "person:actual" })],
    bindings: [binding("EMAIL", "message-1", {
      expectedOrganizationRef: "org:other",
      expectedPersonRef: "person:expected"
    })],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.records[0].reasonCodes.includes("CANONICAL_ORGANIZATION_IDENTITY_CONFLICT"));
  assert.ok(result.records[0].reasonCodes.includes("CANONICAL_PERSON_IDENTITY_CONFLICT"));
  assert.equal(result.observations[0].opportunityRef, null);
});

test("an already matching opportunity ref is confirmed without manufacturing certainty", () => {
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("CHATGPT", "handoff-1", { opportunityRef: "opportunity:canonical-a" })],
    bindings: [binding("CHATGPT", "handoff-1")],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.records[0].disposition, "ALREADY_BOUND");
  assert.equal(result.records[0].opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.records[0].confidence, "NOT_ESTABLISHED");
  assert.equal(result.records[0].monetaryValue, null);
  assert.ok(result.observations[0].evidenceRefs.includes("ev:binding:chatgpt:handoff-1"));
});

test("duplicate or orphan bindings block the projection instead of choosing one", () => {
  const duplicate = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("BOARDROOM", "story-1")],
    bindings: [
      binding("BOARDROOM", "story-1", { bindingId: "binding:one" }),
      binding("BOARDROOM", "story-1", { bindingId: "binding:two" })
    ],
    maximumBindingAgeMinutes: 120
  });
  assert.equal(duplicate.status, "BLOCKED");
  assert.ok(duplicate.issues.includes("DUPLICATE_BINDING_FOR_SOURCE_EVENT"));
  assert.equal(duplicate.observations.length, 0);

  const orphan = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("BOARDROOM", "story-1")],
    bindings: [binding("EMAIL", "message-not-present")],
    maximumBindingAgeMinutes: 120
  });
  assert.equal(orphan.status, "BLOCKED");
  assert.ok(orphan.issues.includes("ORPHAN_BINDING_WITHOUT_SOURCE_EVENT"));
  assert.equal(orphan.records.length, 0);
});

test("secret-like binding provenance is withheld and cannot create a canonical binding", () => {
  const result = bindCrossSourceOpportunityObservationsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation("BOARDROOM", "story-1")],
    bindings: [binding("BOARDROOM", "story-1", { evidenceRefs: ["token=super-secret-value"] })],
    maximumBindingAgeMinutes: 120
  });

  assert.equal(result.status, "READY");
  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.records[0].reasonCodes.includes("UNSAFE_BINDING_EVIDENCE_REF"));
  assert.deepEqual(result.records[0].bindingEvidenceRefs, []);
  assert.equal(result.observations[0].opportunityRef, null);
  assert.ok(!JSON.stringify(result).includes("super-secret-value"));
});

test("result is deterministic, deeply immutable, does not mutate inputs, and grants no consequential authority", () => {
  const source = observation("BOARDROOM", "story-1");
  const explicitBinding = binding("BOARDROOM", "story-1");
  const input = {
    evaluatedAt: EVALUATED_AT,
    observations: [source],
    bindings: [explicitBinding],
    maximumBindingAgeMinutes: 120
  } as const;

  const first = bindCrossSourceOpportunityObservationsV1(input);
  const second = bindCrossSourceOpportunityObservationsV1(input);

  assert.deepEqual(first, second);
  assert.equal(source.opportunityRef, undefined);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(explicitBinding), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.records), true);
  assert.equal(Object.isFrozen(first.records[0]), true);
  assert.equal(Object.isFrozen(first.observations[0]), true);
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.relationshipMutationAuthorized, false);
  assert.equal(first.authority.contactDiscoveryAuthorized, false);
  assert.equal(first.authority.outreachAuthorized, false);
  assert.equal(first.authority.persistenceMutationAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
  assert.equal(first.authority.approvalBypassAuthorized, false);
  assert.equal(first.sourceCountConfidence, "NOT_ESTABLISHED");
});

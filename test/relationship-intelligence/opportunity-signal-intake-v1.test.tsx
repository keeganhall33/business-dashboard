import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOpportunitySignalsV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const EVALUATED_AT = "2026-09-18T17:30:00.000Z";

function observation(overrides: Partial<OpportunitySourceObservationV1> = {}): OpportunitySourceObservationV1 {
  return {
    captureId: "capture:boardroom:1",
    sourceKind: "BOARDROOM",
    sourceEventKey: "boardroom:event:1",
    sourceRef: "boardroom:article:1",
    observedAt: "2026-09-18T16:00:00.000Z",
    evidenceRefs: ["ev:article:1"],
    truthState: "KNOWN",
    signalType: "SPONSORSHIP_OPPORTUNITY",
    organizationRef: "org:brand-a",
    ...overrides
  };
}

test("captures an evidence-backed Boardroom observation for review without inventing opportunity certainty", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation()]
  });

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].disposition, "CAPTURED_FOR_REVIEW");
  assert.equal(result.decisions[0].canonicalOrganizationRef, "org:brand-a");
  assert.equal(result.decisions[0].canonicalPersonRef, null);
  assert.deepEqual(result.decisions[0].planningWindow, { state: "NOT_ESTABLISHED" });
  assert.deepEqual(result.decisions[0].decisionMakerAuthority, { state: "NOT_ESTABLISHED" });
  assert.deepEqual(result.decisions[0].warmAccess, { state: "NOT_ESTABLISHED" });
  assert.equal(result.decisions[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.decisions[0].budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(result.decisions[0].opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.decisions[0].dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
});

test("preserves only separately evidenced email claims and does not infer authority, timing, or access from the source itself", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({
      captureId: "capture:email:1",
      sourceKind: "EMAIL",
      sourceEventKey: "email:message:1",
      sourceRef: "mailbox:keegan:message:1",
      evidenceRefs: ["ev:email:message:1", "ev:email:sponsor-link"],
      organizationRef: "org:brand-a",
      personRef: "person:buyer-a",
      sponsorshipRelationshipClaim: {
        state: "SUPPORTED",
        evidenceRefs: ["ev:email:sponsor-link"]
      }
    })]
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "CAPTURED_FOR_REVIEW");
  assert.equal(decision.sponsorshipRelationship.state, "SUPPORTED");
  assert.deepEqual(decision.decisionMakerAuthority, { state: "NOT_ESTABLISHED" });
  assert.deepEqual(decision.planningWindow, { state: "NOT_ESTABLISHED" });
  assert.deepEqual(decision.warmAccess, { state: "NOT_ESTABLISHED" });
});

test("requires research for unknown, partial, stale, or unanchored observations instead of promoting them", () => {
  for (const truthState of ["UNKNOWN", "PARTIAL", "STALE"] as const) {
    const result = normalizeOpportunitySignalsV1({
      evaluatedAt: EVALUATED_AT,
      observations: [observation({ truthState })]
    });
    assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  }

  const unanchored = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({ organizationRef: null, personRef: null, opportunityRef: null })]
  });
  assert.equal(unanchored.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(unanchored.decisions[0].reasonCodes.includes("NO_CANONICAL_ENTITY_ANCHOR"));

  const old = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    maximumSignalAgeDays: 7,
    observations: [observation({ observedAt: "2026-09-01T16:00:00.000Z" })]
  });
  assert.equal(old.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(old.decisions[0].reasonCodes.includes("SOURCE_OBSERVATION_STALE"));
});

test("keeps an evidenced planning window only when its evidence is in the observation lineage", () => {
  const supported = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({
      evidenceRefs: ["ev:article:1", "ev:planning:1"],
      planningWindow: {
        startAt: "2026-10-01T00:00:00.000Z",
        endAt: "2026-11-01T00:00:00.000Z",
        rationale: "Explicit planning dates supplied by the structured upstream source.",
        evidenceRefs: ["ev:planning:1"]
      }
    })]
  });
  assert.equal(supported.decisions[0].planningWindow.state, "SUPPORTED");
  assert.equal(supported.decisions[0].disposition, "CAPTURED_FOR_REVIEW");

  const brokenLineage = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({
      planningWindow: {
        startAt: "2026-10-01T00:00:00.000Z",
        endAt: "2026-11-01T00:00:00.000Z",
        rationale: "Claim cites evidence not carried by the observation.",
        evidenceRefs: ["ev:not-in-lineage"]
      }
    })]
  });
  assert.equal(brokenLineage.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(brokenLineage.decisions[0].reasonCodes.includes("PLANNING_WINDOW_EVIDENCE_NOT_IN_OBSERVATION_LINEAGE"));
});

test("requires a canonical person for explicit decision-maker and warm-access claims", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({
      evidenceRefs: ["ev:article:1", "ev:authority", "ev:warm"],
      personRef: null,
      decisionMakerClaim: { authorityClass: "DECISION_MAKER", evidenceRefs: ["ev:authority"] },
      warmAccessClaim: { state: "SUPPORTED", evidenceRefs: ["ev:warm"] }
    })]
  });

  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("DECISION_MAKER_CLAIM_WITHOUT_CANONICAL_PERSON"));
  assert.ok(result.decisions[0].reasonCodes.includes("WARM_ACCESS_CLAIM_WITHOUT_CANONICAL_PERSON"));
});

test("deduplicates identical source events without inflating evidence or confidence", () => {
  const first = observation();
  const duplicate = observation({ captureId: "capture:boardroom:duplicate" });
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [first, duplicate]
  });

  assert.equal(result.decisions.length, 1);
  assert.deepEqual(result.decisions[0].sourceEventKeys, ["boardroom:event:1"]);
  assert.deepEqual(result.decisions[0].evidenceRefs, ["ev:article:1"]);
  assert.equal(result.decisions[0].confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.equal(result.counts.CAPTURED_FOR_REVIEW, 1);
});

test("fails conflicting duplicate source events to verification instead of choosing one", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [
      observation(),
      observation({ captureId: "capture:boardroom:2", organizationRef: "org:brand-b" })
    ]
  });

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("CONFLICTING_DUPLICATE_SOURCE_EVENT"));
});

test("groups independent sources only by an exact canonical opportunity ref and does not convert source count to confidence", () => {
  const boardroom = observation({ opportunityRef: "opportunity:exact-1" });
  const chatgpt = observation({
    captureId: "capture:chatgpt:1",
    sourceKind: "CHATGPT",
    sourceEventKey: "chatgpt:event:1",
    sourceRef: "chatgpt:artifact:1",
    evidenceRefs: ["ev:chatgpt:1"],
    opportunityRef: "opportunity:exact-1"
  });

  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [boardroom, chatgpt]
  });

  assert.equal(result.decisions.length, 1);
  assert.deepEqual(result.decisions[0].sourceKinds, ["BOARDROOM", "CHATGPT"]);
  assert.deepEqual(result.decisions[0].evidenceRefs, ["ev:article:1", "ev:chatgpt:1"]);
  assert.equal(result.decisions[0].confidenceFromSourceCount, "NOT_ESTABLISHED");
  assert.equal(result.decisions[0].opportunityCertainty, "NOT_ESTABLISHED");
});

test("does not merge similar-looking organization refs when no exact opportunity ref exists", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [
      observation({ organizationRef: "org:nike" }),
      observation({
        captureId: "capture:email:2",
        sourceKind: "EMAIL",
        sourceEventKey: "email:message:2",
        sourceRef: "mailbox:keegan:message:2",
        evidenceRefs: ["ev:email:2"],
        organizationRef: "org:nike-emea"
      })
    ]
  });

  assert.equal(result.decisions.length, 2);
  assert.equal(result.groupingPolicy, "EXACT_CANONICAL_OPPORTUNITY_REF_ELSE_SOURCE_EVENT");
  assert.equal(result.inferencePolicy, "STRUCTURED_EVIDENCE_ONLY_NO_NAME_OR_TEXT_INFERENCE");
});

test("exact opportunity grouping exposes conflicting canonical identity claims for verification", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [
      observation({ opportunityRef: "opportunity:exact-2", organizationRef: "org:brand-a" }),
      observation({
        captureId: "capture:email:3",
        sourceKind: "EMAIL",
        sourceEventKey: "email:message:3",
        sourceRef: "mailbox:keegan:message:3",
        evidenceRefs: ["ev:email:3"],
        opportunityRef: "opportunity:exact-2",
        organizationRef: "org:brand-b"
      })
    ]
  });

  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.decisions[0].canonicalOrganizationRef, null);
  assert.ok(result.decisions[0].reasonCodes.includes("CANONICAL_ORGANIZATION_CONFLICT"));
});

test("suppresses explicit NONE signals and never turns capture into authority", () => {
  const result = normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({ signalType: "NONE" })]
  });

  assert.equal(result.decisions[0].disposition, "SUPPRESS");
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.spendAuthorized, false);
  assert.equal(result.authority.contractAuthorized, false);
});

test("rejects future-dated observations instead of manufacturing recency", () => {
  assert.throws(() => normalizeOpportunitySignalsV1({
    evaluatedAt: EVALUATED_AT,
    observations: [observation({ observedAt: "2026-09-18T18:00:00.000Z" })]
  }), /must not be future-dated/);
});

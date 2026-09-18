import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportHandoffResultV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  qualifyOpportunityHandoffEvidenceV1,
  type OpportunityQualificationEvidencePackV1,
  type OpportunityQualificationEvidenceV1
} from "../../src/lib/relationships-crm/opportunity-evidence-qualification-v1";

const NOW = "2026-09-18T08:00:00.000Z";
const OBSERVED_AT = "2026-09-17T12:00:00.000Z";

function candidateHandoff(overrides: {
  truthState?: OpportunityHandoffTruthStateV1;
  qualification?: "WATCH" | "CANDIDATE" | "QUALIFIED";
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
} = {}): OpportunityImportHandoffResultV1 {
  return compileOpportunityImportHandoffV1({
    source: "BOARDROOM",
    sourceInteractionRef: "boardroom:story-1",
    candidate: {
      sourceCandidateKey: "boardroom-story:story-1",
      title: "Evidence-backed partnership candidate",
      qualification: overrides.qualification ?? "CANDIDATE",
      truthState: overrides.truthState ?? "KNOWN",
      evidenceRefs: ["source:evidence"],
      personRefs: overrides.personRefs ?? [],
      organizationRefs: overrides.organizationRefs ?? ["org:canonical"],
      existingOpportunityRef: overrides.existingOpportunityRef ?? null
    }
  });
}

function assertion(
  overrides: Partial<OpportunityQualificationEvidenceV1> = {}
): OpportunityQualificationEvidenceV1 {
  return {
    state: "KNOWN",
    support: "SUPPORTED",
    observedAt: OBSERVED_AT,
    evidenceRefs: ["research:evidence"],
    ...overrides
  };
}

function evidence(overrides: Partial<OpportunityQualificationEvidencePackV1> = {}): OpportunityQualificationEvidencePackV1 {
  return {
    opportunityNeed: assertion({ evidenceRefs: ["research:need"] }),
    keeganSpecificFit: assertion({ evidenceRefs: ["research:fit"] }),
    actionablePath: assertion({ evidenceRefs: ["research:path"] }),
    ...overrides
  };
}

test("promotes a candidate only when every required qualification dimension is known, current, and supported", () => {
  const original = candidateHandoff();
  assert.equal(original.disposition, "NEEDS_VERIFICATION");

  const result = qualifyOpportunityHandoffEvidenceV1({
    handoff: original,
    evidence: evidence(),
    now: NOW
  });

  assert.equal(result.status, "QUALIFIED");
  assert.equal(result.qualifiedHandoff.payload.qualification, "QUALIFIED");
  assert.equal(result.qualifiedHandoff.disposition, "READY_FOR_CANONICAL_UPSERT");
  assert.ok(result.reasonCodes.includes("EVIDENCE_GATES_MET"));
});

test("qualified evidence links only through an explicit existing canonical opportunity ref", () => {
  const original = candidateHandoff({ existingOpportunityRef: "opportunity:canonical-123" });
  const result = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: evidence(), now: NOW });

  assert.equal(result.status, "QUALIFIED");
  assert.equal(result.qualifiedHandoff.disposition, "LINK_TO_EXISTING");
  assert.equal(result.qualifiedHandoff.payload.existingOpportunityRef, "opportunity:canonical-123");
  assert.equal(result.qualifiedHandoff.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
});

test("does not convert inferred source truth into canonical truth just because research dimensions are supported", () => {
  const original = candidateHandoff({ truthState: "INFERRED" });
  const result = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: evidence(), now: NOW });

  assert.equal(result.status, "NEEDS_VERIFICATION");
  assert.equal(result.qualifiedHandoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("EVIDENCE_GATES_MET_BUT_CANONICAL_HANDOFF_REMAINS_BLOCKED"));
  assert.ok(result.qualifiedHandoff.reasonCodes.includes("TRUTH_INFERRED_REQUIRES_VERIFICATION"));
});

test("does not qualify an opportunity without a canonical person, organization, or explicit opportunity anchor", () => {
  const original = candidateHandoff({ organizationRefs: [], personRefs: [] });
  const result = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: evidence(), now: NOW });

  assert.equal(result.status, "NEEDS_VERIFICATION");
  assert.equal(result.qualifiedHandoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.qualifiedHandoff.reasonCodes.includes("CANONICAL_ENTITY_ANCHOR_REQUIRED"));
});

test("fails closed on stale, conflicted, partial, inferred, and unknown qualification evidence", () => {
  const cases: readonly [OpportunityHandoffTruthStateV1, "NEEDS_RESEARCH" | "NEEDS_VERIFICATION"][] = [
    ["STALE", "NEEDS_VERIFICATION"],
    ["CONFLICTED", "NEEDS_VERIFICATION"],
    ["PARTIAL", "NEEDS_VERIFICATION"],
    ["INFERRED", "NEEDS_VERIFICATION"],
    ["UNKNOWN", "NEEDS_RESEARCH"]
  ];

  for (const [state, expectedStatus] of cases) {
    const result = qualifyOpportunityHandoffEvidenceV1({
      handoff: candidateHandoff(),
      evidence: evidence({ opportunityNeed: assertion({ state }) }),
      now: NOW
    });
    assert.equal(result.status, expectedStatus, state);
    assert.equal(result.qualifiedHandoff.payload.qualification, "CANDIDATE", state);
  }
});

test("fails closed when known evidence explicitly does not support a required dimension", () => {
  const original = candidateHandoff();
  const result = qualifyOpportunityHandoffEvidenceV1({
    handoff: original,
    evidence: evidence({
      actionablePath: assertion({ support: "NOT_SUPPORTED", evidenceRefs: ["research:no-path"] })
    }),
    now: NOW
  });

  assert.equal(result.status, "NOT_SUPPORTED");
  assert.equal(result.qualifiedHandoff, original);
  assert.ok(result.reasonCodes.includes("ACTIONABLE_PATH_NOT_SUPPORTED"));
});

test("does not let follow-up research silently overturn an already-qualified source", () => {
  const original = candidateHandoff({ qualification: "QUALIFIED" });
  assert.equal(original.disposition, "READY_FOR_CANONICAL_UPSERT");

  const result = qualifyOpportunityHandoffEvidenceV1({
    handoff: original,
    evidence: evidence({
      keeganSpecificFit: assertion({ support: "NOT_SUPPORTED", evidenceRefs: ["research:no-fit"] })
    }),
    now: NOW
  });

  assert.equal(result.status, "NEEDS_VERIFICATION");
  assert.equal(result.qualifiedHandoff, original);
  assert.ok(result.reasonCodes.includes("RESEARCH_CONTRADICTS_EXISTING_QUALIFICATION"));
});

test("keeps WATCH sources watch-only even when later evidence fields are positive", () => {
  const original = candidateHandoff({ qualification: "WATCH" });
  const result = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: evidence(), now: NOW });

  assert.equal(result.status, "WATCH_ONLY");
  assert.equal(result.qualifiedHandoff.payload.qualification, "WATCH");
  assert.equal(result.qualifiedHandoff.disposition, "WATCH_ONLY");
});

test("requires fresh evidence and treats age expiry separately from source timing", () => {
  const result = qualifyOpportunityHandoffEvidenceV1({
    handoff: candidateHandoff(),
    evidence: evidence({
      opportunityNeed: assertion({ observedAt: "2026-06-01T00:00:00.000Z" })
    }),
    now: NOW,
    maximumEvidenceAgeDays: 30
  });

  assert.equal(result.status, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("OPPORTUNITY_NEED_EVIDENCE_STALE"));
  assert.equal(result.qualifiedHandoff.payload.qualification, "CANDIDATE");
});

test("preserves source identity, unions provenance deterministically, stays immutable, and grants no authority", () => {
  const original = candidateHandoff();
  const before = JSON.stringify(original);
  const pack = evidence({
    opportunityNeed: assertion({ evidenceRefs: ["research:z", "research:a"] }),
    keeganSpecificFit: assertion({ evidenceRefs: ["research:a", "research:fit"] })
  });

  const first = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: pack, now: NOW });
  const second = qualifyOpportunityHandoffEvidenceV1({ handoff: original, evidence: pack, now: NOW });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(original), before);
  assert.equal(first.qualifiedHandoff.handoffId, original.handoffId);
  assert.equal(first.qualifiedHandoff.idempotencyKey, original.idempotencyKey);
  assert.deepEqual(first.evidenceRefs, [
    "research:a",
    "research:fit",
    "research:path",
    "research:z",
    "source:evidence"
  ]);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
  assert.equal(first.qualifiedHandoff.crmMutationPerformed, false);
  assert.equal(first.qualifiedHandoff.externalActionPerformed, false);
  assert.equal(first.qualifiedHandoff.writeAuthorityGranted, false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.qualifiedHandoff));
});

test("rejects future-dated qualification evidence", () => {
  assert.throws(
    () =>
      qualifyOpportunityHandoffEvidenceV1({
        handoff: candidateHandoff(),
        evidence: evidence({
          opportunityNeed: assertion({ observedAt: "2026-09-19T00:00:00.000Z" })
        }),
        now: NOW
      }),
    /must not be future-dated/
  );
});

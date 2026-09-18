import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffSourceV1,
  type OpportunityImportHandoffResultV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";
import type {
  OpportunityQualificationEvidencePackV1,
  OpportunityQualificationEvidenceV1
} from "../../src/lib/relationships-crm/opportunity-evidence-qualification-v1";
import {
  compileSourceAwareOpportunityCaptureGateV1
} from "../../src/lib/relationships-crm/source-aware-opportunity-capture-gate-v1";

const NOW = "2026-09-18T14:00:00.000Z";
const OBSERVED_AT = "2026-09-17T18:00:00.000Z";

function assertion(
  evidenceRef: string,
  overrides: Partial<OpportunityQualificationEvidenceV1> = {}
): OpportunityQualificationEvidenceV1 {
  return {
    state: "KNOWN",
    support: "SUPPORTED",
    observedAt: OBSERVED_AT,
    evidenceRefs: [evidenceRef],
    ...overrides
  };
}

function evidence(
  overrides: Partial<OpportunityQualificationEvidencePackV1> = {}
): OpportunityQualificationEvidencePackV1 {
  return {
    opportunityNeed: assertion("research:need"),
    keeganSpecificFit: assertion("research:fit"),
    actionablePath: assertion("research:path"),
    ...overrides
  };
}

function handoff(
  source: OpportunityHandoffSourceV1,
  sourceCandidateKey: string,
  qualification: "WATCH" | "CANDIDATE" | "QUALIFIED" = "CANDIDATE",
  overrides: {
    organizationRefs?: readonly string[];
    existingOpportunityRef?: string | null;
    truthState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";
  } = {}
): OpportunityImportHandoffResultV1 {
  return compileOpportunityImportHandoffV1({
    source,
    sourceInteractionRef: `${source.toLowerCase()}:interaction:${sourceCandidateKey}`,
    candidate: {
      sourceCandidateKey,
      title: `Opportunity ${sourceCandidateKey}`,
      qualification,
      truthState: overrides.truthState ?? "KNOWN",
      evidenceRefs: [`${source.toLowerCase()}:evidence:${sourceCandidateKey}`],
      personRefs: [],
      organizationRefs: overrides.organizationRefs ?? ["org:canonical-brand"],
      existingOpportunityRef: overrides.existingOpportunityRef ?? null
    }
  });
}

test("turns an evidence-qualified Boardroom candidate into a canonical create plan without performing the write", () => {
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [{ handoff: handoff("BOARDROOM", "story-1"), evidence: evidence() }],
    existingOpportunities: [],
    now: NOW
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "CANONICAL_PLAN_READY");
  assert.equal(decision.qualification?.status, "QUALIFIED");
  assert.equal(decision.canonicalPlan?.disposition, "CREATE");
  assert.equal(decision.canonicalPlan?.mutation?.kind, "CREATE_CANONICAL_OPPORTUNITY");
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
});

test("does not let research silently promote a tracked or assistant-suggested ChatGPT candidate", () => {
  const chatgptCandidate = handoff("CHATGPT", "conversation-opportunity");
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [{ handoff: chatgptCandidate, evidence: evidence() }],
    existingOpportunities: [],
    now: NOW
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "EXPLICIT_USER_QUALIFICATION_REQUIRED");
  assert.equal(decision.qualification, null);
  assert.equal(decision.canonicalPlan, null);
  assert.ok(decision.reasonCodes.includes("CHATGPT_CANDIDATE_CANNOT_BE_PROMOTED_BY_RESEARCH_ALONE"));
  assert.equal(chatgptCandidate.payload.qualification, "CANDIDATE");
});

test("allows an explicitly qualified ChatGPT capture through the same evidence gates", () => {
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [{ handoff: handoff("CHATGPT", "explicit-save", "QUALIFIED"), evidence: evidence() }],
    existingOpportunities: [],
    now: NOW
  });

  const decision = result.decisions[0];
  assert.equal(decision.qualification?.status, "ALREADY_QUALIFIED");
  assert.equal(decision.disposition, "CANONICAL_PLAN_READY");
  assert.equal(decision.canonicalPlan?.disposition, "CREATE");
});

test("fails closed on incomplete opportunity evidence instead of inventing qualification certainty", () => {
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [{
      handoff: handoff("IONOS", "dormant-thread-1"),
      evidence: evidence({
        actionablePath: assertion("research:path-unknown", { state: "UNKNOWN", support: "UNKNOWN" })
      })
    }],
    existingOpportunities: [],
    now: NOW
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "NEEDS_RESEARCH");
  assert.equal(decision.canonicalPlan, null);
  assert.equal(decision.qualification?.status, "NEEDS_RESEARCH");
});

test("does not invent a cross-source merge when separate sources share an organization", () => {
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [
      { handoff: handoff("BOARDROOM", "brand-story"), evidence: evidence() },
      { handoff: handoff("IONOS", "email-thread"), evidence: evidence() }
    ],
    existingOpportunities: [],
    now: NOW
  });

  assert.equal(result.counts.canonicalPlanReady, 2);
  assert.equal(result.crossSourceMergeInferred, false);
  assert.equal(result.decisions[0].canonicalPlan?.disposition, "CREATE");
  assert.equal(result.decisions[1].canonicalPlan?.disposition, "CREATE");
  assert.notEqual(result.decisions[0].handoffId, result.decisions[1].handoffId);
});

test("requires an explicitly referenced existing opportunity to exist before planning a link", () => {
  const result = compileSourceAwareOpportunityCaptureGateV1({
    candidates: [{
      handoff: handoff("IONOS", "known-existing", "QUALIFIED", {
        existingOpportunityRef: "opportunity:missing"
      }),
      evidence: evidence()
    }],
    existingOpportunities: [],
    now: NOW
  });

  const decision = result.decisions[0];
  assert.equal(decision.disposition, "NEEDS_VERIFICATION");
  assert.equal(decision.canonicalPlan?.disposition, "VERIFY_REQUIRED");
  assert.ok(decision.reasonCodes.includes("EXPLICIT_EXISTING_OPPORTUNITY_NOT_FOUND"));
});

test("rejects duplicate handoff identities rather than double-planning the same source candidate", () => {
  const same = handoff("BOARDROOM", "duplicate-story");
  assert.throws(
    () => compileSourceAwareOpportunityCaptureGateV1({
      candidates: [
        { handoff: same, evidence: evidence() },
        { handoff: same, evidence: evidence() }
      ],
      existingOpportunities: [],
      now: NOW
    }),
    /duplicate handoffId/
  );
});

test("is deterministic, deeply immutable, and grants no relationship, timing, sponsorship, contact, or action authority", () => {
  const value = {
    candidates: [{ handoff: handoff("BOARDROOM", "immutable-story"), evidence: evidence() }],
    existingOpportunities: [],
    now: NOW
  } as const;
  const before = structuredClone(value);
  const first = compileSourceAwareOpportunityCaptureGateV1(value);
  const second = compileSourceAwareOpportunityCaptureGateV1(value);

  assert.deepEqual(first, second);
  assert.deepEqual(value, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(first.contactInfoInferred, false);
  assert.equal(first.relationshipInferred, false);
  assert.equal(first.sponsorshipInferred, false);
  assert.equal(first.timingInferred, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
});

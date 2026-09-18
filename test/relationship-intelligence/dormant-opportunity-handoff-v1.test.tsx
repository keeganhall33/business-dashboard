import assert from "node:assert/strict";
import test from "node:test";

import {
  compileDormantOpportunityHandoffsV1,
  type DormantOpportunityHandoffContextV1
} from "../../src/lib/relationship-intelligence/dormant-opportunity-handoff-v1";
import {
  projectDormantEmailOpportunitiesV1,
  type DormantBusinessSignalV1,
  type DormantCanonicalActivityV1,
  type DormantEmailOpportunityProjectorResultV1,
  type DormantTruthStateV1
} from "../../src/lib/relationship-intelligence/dormant-email-opportunity-projector-v1";

const NOW = "2026-09-18T08:00:00.000Z";
const OLD = "2026-07-20T08:00:00.000Z";

function activity(overrides: Partial<DormantCanonicalActivityV1> = {}): DormantCanonicalActivityV1 {
  return {
    activityId: "activity:1",
    conversationKey: "thread:1",
    occurredAt: OLD,
    sourceRef: "ionos:message:1",
    evidenceRefs: ["evidence:message:1"],
    truthState: "KNOWN",
    threadState: "OPEN",
    businessSignal: "SPONSORSHIP",
    direction: "INBOUND",
    personRef: null,
    organizationRef: "org:brand-1",
    opportunityRef: null,
    explicitNextStep: null,
    nextStepState: null,
    dedupeKey: "thread:1",
    ...overrides
  };
}

function projection(
  signal: DormantBusinessSignalV1 = "SPONSORSHIP",
  truthState: DormantTruthStateV1 = "KNOWN",
  overrides: Partial<DormantCanonicalActivityV1> = {}
): DormantEmailOpportunityProjectorResultV1 {
  return projectDormantEmailOpportunitiesV1({
    now: NOW,
    minimumDormantDays: 14,
    activities: [activity({ businessSignal: signal, truthState, ...overrides })]
  });
}

function context(candidateId: string, overrides: Partial<DormantOpportunityHandoffContextV1> = {}): DormantOpportunityHandoffContextV1 {
  return {
    candidateId,
    sourceInteractionRef: "ionos:thread:1",
    title: "Evidence-backed sponsorship discussion",
    titleTruthState: "KNOWN",
    titleEvidenceRefs: ["evidence:title:1"],
    ...overrides
  };
}

test("turns a KNOWN dormant business discussion into the canonical IONOS opportunity handoff", () => {
  const source = projection();
  const candidateId = source.queue[0].candidateId;
  const result = compileDormantOpportunityHandoffsV1({ projection: source, contexts: [context(candidateId)] });
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "READY_FOR_CANONICAL_HANDOFF");
  assert.equal(decision.handoff?.source, "IONOS");
  assert.equal(decision.handoff?.disposition, "READY_FOR_CANONICAL_UPSERT");
  assert.equal(decision.handoff?.payload.title, "Evidence-backed sponsorship discussion");
  assert.deepEqual(decision.handoff?.payload.organizationRefs, ["org:brand-1"]);
  assert.deepEqual(decision.handoff?.payload.personRefs, []);
  assert.equal(decision.handoff?.payload.existingOpportunityRef, null);
  assert.equal(decision.handoff?.payload.truthState, "KNOWN");
  assert.deepEqual(decision.evidenceRefs, ["evidence:message:1", "evidence:title:1"]);
});

test("links a dormant thread to an explicitly anchored existing opportunity without fuzzy matching", () => {
  const source = projection("WARM_INTRO", "KNOWN", {
    organizationRef: "org:agency-1",
    opportunityRef: "opportunity:existing-1"
  });
  const candidateId = source.queue[0].candidateId;
  const result = compileDormantOpportunityHandoffsV1({ projection: source, contexts: [context(candidateId)] });

  assert.equal(result.decisions[0].disposition, "LINK_TO_EXISTING");
  assert.equal(result.decisions[0].handoff?.disposition, "LINK_TO_EXISTING");
  assert.equal(result.decisions[0].handoff?.payload.existingOpportunityRef, "opportunity:existing-1");
  assert.equal(result.decisions[0].handoff?.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
});

test("keeps warm intros and stale strategic relationships out of opportunity creation without an opportunity anchor", () => {
  for (const signal of ["WARM_INTRO", "STRATEGIC_RELATIONSHIP"] as const) {
    const source = projection(signal, "KNOWN", { opportunityRef: null });
    const result = compileDormantOpportunityHandoffsV1({ projection: source, contexts: [] });

    assert.equal(result.decisions[0].disposition, "RELATIONSHIP_REVIEW_ONLY");
    assert.equal(result.decisions[0].handoff, null);
    assert.deepEqual(result.decisions[0].reasonCodes, ["RELATIONSHIP_SIGNAL_IS_NOT_ENOUGH_TO_CREATE_OPPORTUNITY"]);
  }
});

test("preserves stale, partial, unknown, and conflicted truth as verification-required instead of certainty", () => {
  for (const state of ["STALE", "PARTIAL", "UNKNOWN", "CONFLICTED"] as const) {
    const source = projection("SPONSORSHIP", state);
    const candidateId = source.queue[0].candidateId;
    const result = compileDormantOpportunityHandoffsV1({ projection: source, contexts: [context(candidateId)] });

    assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
    assert.equal(result.decisions[0].truthState, state);
    assert.equal(result.decisions[0].handoff?.disposition, "NEEDS_VERIFICATION");
    assert.equal(result.decisions[0].handoff?.payload.truthState, state);
  }
});

test("requires an evidenced title instead of inventing a CRM opportunity title from thread content", () => {
  const source = projection();
  const result = compileDormantOpportunityHandoffsV1({ projection: source, contexts: [] });

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.equal(result.decisions[0].handoff, null);
  assert.deepEqual(result.decisions[0].reasonCodes, ["EVIDENCED_TITLE_CONTEXT_REQUIRED"]);
});

test("refuses a stale or conflicted title even when the dormant candidate itself is KNOWN", () => {
  for (const state of ["STALE", "CONFLICTED"] as const) {
    const source = projection();
    const candidateId = source.queue[0].candidateId;
    const result = compileDormantOpportunityHandoffsV1({
      projection: source,
      contexts: [context(candidateId, { titleTruthState: state, titleEvidenceRefs: [`evidence:title:${state}`] })]
    });

    assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
    assert.equal(result.decisions[0].handoff, null);
    assert.deepEqual(result.decisions[0].reasonCodes, [`TITLE_${state}_REQUIRES_VERIFICATION`]);
    assert.ok(result.decisions[0].evidenceRefs.includes(`evidence:title:${state}`));
  }
});

test("fails closed if a terminal thread is injected into a purported projector result", () => {
  const source = projection();
  const queued = source.queue[0];
  const tampered = {
    ...source,
    queue: [{ ...queued, threadState: "RESOLVED" as const }]
  } as DormantEmailOpportunityProjectorResultV1;
  const result = compileDormantOpportunityHandoffsV1({ projection: tampered, contexts: [] });

  assert.equal(result.decisions[0].disposition, "SUPPRESS");
  assert.equal(result.decisions[0].handoff, null);
  assert.deepEqual(result.decisions[0].reasonCodes, ["THREAD_STATE_RESOLVED_IS_TERMINAL"]);
});

test("rejects orphaned title context so evidence cannot be attached to the wrong dormant candidate", () => {
  const source = projection();
  assert.throws(
    () => compileDormantOpportunityHandoffsV1({ projection: source, contexts: [context("dormant:wrong-thread")] }),
    /does not match a queued dormant candidate/
  );
});

test("is deterministic, deeply immutable, and grants no mailbox, CRM, write, or external-action authority", () => {
  const source = projection();
  const candidateId = source.queue[0].candidateId;
  const input = { projection: source, contexts: [context(candidateId)] } as const;
  const first = compileDormantOpportunityHandoffsV1(input);
  const second = compileDormantOpportunityHandoffsV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.mailboxMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
  assert.equal(first.decisions[0].handoff?.crmMutationPerformed, false);
  assert.equal(first.decisions[0].handoff?.externalActionPerformed, false);
  assert.equal(first.decisions[0].handoff?.writeAuthorityGranted, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].handoff), true);
});

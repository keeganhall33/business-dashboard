import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBoardroomOpportunitiesV1,
  type BoardroomOpportunityClassifierResultV1,
  type BoardroomStoryV1
} from "../../src/lib/discovery-intelligence/boardroom-opportunity-classifier-v1";
import { compileBoardroomOpportunityHandoffsV1 } from "../../src/lib/discovery-intelligence/boardroom-opportunity-handoff-v1";

const NOW = "2026-09-18T08:00:00.000Z";

function story(overrides: Partial<BoardroomStoryV1> = {}): BoardroomStoryV1 {
  return {
    storyId: "story-1",
    title: "Brand signs sponsorship with sports property",
    summary: "The sponsorship includes a new fan activation program.",
    publishedAt: "2026-09-17T18:00:00.000Z",
    sourceRef: "boardroom:story-1",
    evidenceRefs: ["evidence:story-1"],
    evidenceState: "KNOWN",
    entityRefs: ["entity:unspecified-participant"],
    organizationRefs: ["org:brand", "org:property"],
    syndicationKey: "brand-sports-sponsorship",
    ...overrides
  };
}

function classify(stories: readonly BoardroomStoryV1[]): BoardroomOpportunityClassifierResultV1 {
  return classifyBoardroomOpportunitiesV1({ stories, now: NOW });
}

test("keeps research-qualified Boardroom signals out of canonical opportunity creation", () => {
  const classification = classify([story()]);
  assert.equal(classification.decisions[0].disposition, "QUALIFIED_FOR_RESEARCH");

  const result = compileBoardroomOpportunityHandoffsV1({ classification });
  const item = result.items[0];

  assert.equal(item.bridgeDisposition, "NEEDS_RESEARCH");
  assert.equal(item.handoff?.payload.qualification, "CANDIDATE");
  assert.equal(item.handoff?.disposition, "NEEDS_VERIFICATION");
  assert.ok(item.reasonCodes.includes("RESEARCH_QUALIFICATION_IS_NOT_CANONICAL_QUALIFICATION"));
  assert.equal(item.handoff?.disposition === "READY_FOR_CANONICAL_UPSERT", false);
});

test("links only an explicit known existing opportunity without creating a new one", () => {
  const classification = classify([
    story({
      storyId: "existing-story",
      sourceRef: "boardroom:existing-story",
      evidenceRefs: ["evidence:existing-story"],
      syndicationKey: "existing-story",
      existingOpportunityRef: "opportunity:canonical-123"
    })
  ]);
  assert.equal(classification.decisions[0].recommendedAction, "LINK_TO_EXISTING");

  const result = compileBoardroomOpportunityHandoffsV1({ classification });
  const item = result.items[0];

  assert.equal(item.bridgeDisposition, "LINK_TO_EXISTING");
  assert.equal(item.handoff?.disposition, "LINK_TO_EXISTING");
  assert.equal(item.handoff?.payload.existingOpportunityRef, "opportunity:canonical-123");
  assert.equal(item.handoff?.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
  assert.ok(item.reasonCodes.includes("EXPLICIT_EXISTING_OPPORTUNITY_LINK_ONLY"));
});

test("never promotes generic classifier entity refs into person identity", () => {
  const classification = classify([
    story({
      entityRefs: ["entity:ambiguous-a", "entity:ambiguous-b"],
      organizationRefs: ["org:evidenced"]
    })
  ]);

  const item = compileBoardroomOpportunityHandoffsV1({ classification }).items[0];

  assert.deepEqual(item.unmappedEntityRefs, ["entity:ambiguous-a", "entity:ambiguous-b"]);
  assert.deepEqual(item.handoff?.payload.personRefs, []);
  assert.deepEqual(item.handoff?.payload.organizationRefs, ["org:evidenced"]);
  assert.ok(item.reasonCodes.includes("GENERIC_ENTITY_REFS_NOT_PROMOTED_TO_PERSON_REFS"));
});

test("keeps stale and conflicted source evidence fail-closed", () => {
  for (const evidenceState of ["STALE", "CONFLICTED"] as const) {
    const classification = classify([
      story({
        storyId: `story-${evidenceState.toLowerCase()}`,
        sourceRef: `boardroom:${evidenceState.toLowerCase()}`,
        evidenceRefs: [`evidence:${evidenceState.toLowerCase()}`],
        syndicationKey: `story-${evidenceState.toLowerCase()}`,
        evidenceState,
        existingOpportunityRef: "opportunity:existing"
      })
    ]);

    const item = compileBoardroomOpportunityHandoffsV1({ classification }).items[0];
    assert.equal(item.classificationDisposition, "WATCH");
    assert.equal(item.bridgeDisposition, "WATCH_ONLY");
    assert.equal(item.handoff?.disposition, "WATCH_ONLY");
    assert.notEqual(item.bridgeDisposition, "LINK_TO_EXISTING");
  }
});

test("suppresses ignored and syndicated duplicate stories instead of creating handoffs", () => {
  const classification = classify([
    story({
      storyId: "primary",
      sourceRef: "boardroom:primary",
      evidenceRefs: ["evidence:primary"],
      syndicationKey: "same-story"
    }),
    story({
      storyId: "duplicate",
      sourceRef: "boardroom:duplicate",
      evidenceRefs: ["evidence:duplicate"],
      publishedAt: "2026-09-17T17:00:00.000Z",
      syndicationKey: "same-story"
    }),
    story({
      storyId: "score",
      title: "Team wins game final score",
      summary: "Highlights and statistics from the match.",
      sourceRef: "boardroom:score",
      evidenceRefs: ["evidence:score"],
      entityRefs: [],
      organizationRefs: ["org:team"],
      syndicationKey: "score"
    })
  ]);

  const result = compileBoardroomOpportunityHandoffsV1({ classification });
  const duplicate = result.items.find((item) => item.storyId === "duplicate");
  const score = result.items.find((item) => item.storyId === "score");

  assert.equal(duplicate?.bridgeDisposition, "SUPPRESS");
  assert.equal(duplicate?.handoff, null);
  assert.equal(score?.bridgeDisposition, "SUPPRESS");
  assert.equal(score?.handoff, null);
  assert.equal(result.counts.suppressed, 2);
});

test("preserves source evidence identity and grants no write or external authority", () => {
  const classification = classify([
    story({
      storyId: "evidence-story",
      sourceRef: "boardroom:source:exact",
      evidenceRefs: ["evidence:z", "evidence:a"],
      entityRefs: [],
      organizationRefs: ["org:one"]
    })
  ]);
  const before = JSON.stringify(classification);

  const first = compileBoardroomOpportunityHandoffsV1({ classification });
  const second = compileBoardroomOpportunityHandoffsV1({ classification });
  const item = first.items[0];

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(classification), before);
  assert.equal(item.sourceRef, "boardroom:source:exact");
  assert.deepEqual(item.evidenceRefs, ["evidence:a", "evidence:z"]);
  assert.equal(item.handoff?.source, "BOARDROOM");
  assert.equal(item.handoff?.sourceInteractionRef, "boardroom:source:exact");
  assert.equal(item.handoff?.crmMutationPerformed, false);
  assert.equal(item.handoff?.externalActionPerformed, false);
  assert.equal(item.handoff?.writeAuthorityGranted, false);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(item));
});

test("rejects duplicate story identities and a classifier that violates its read-only boundary", () => {
  const classification = classify([story()]);
  const duplicateDecision = {
    ...classification,
    decisions: [classification.decisions[0], classification.decisions[0]]
  } as BoardroomOpportunityClassifierResultV1;

  assert.throws(
    () => compileBoardroomOpportunityHandoffsV1({ classification: duplicateDecision }),
    /duplicate storyId/
  );

  const mutatedBoundary = {
    ...classification,
    crmMutationPerformed: true
  } as unknown as BoardroomOpportunityClassifierResultV1;
  assert.throws(
    () => compileBoardroomOpportunityHandoffsV1({ classification: mutatedBoundary }),
    /read-only classifier boundary/
  );
});

test("a malformed link request without an explicit opportunity ref remains non-mutating", () => {
  const classification = classify([
    story({
      storyId: "candidate",
      title: "Company appoints new CMO",
      summary: "The company appoints a new CMO to lead marketing and partnerships.",
      sourceRef: "boardroom:candidate",
      evidenceRefs: ["evidence:candidate"],
      entityRefs: ["person:untyped"],
      organizationRefs: ["org:company"],
      syndicationKey: "candidate"
    })
  ]);
  const original = classification.decisions[0];
  const tampered = {
    ...classification,
    decisions: [
      {
        ...original,
        disposition: "CANDIDATE",
        recommendedAction: "LINK_TO_EXISTING",
        existingOpportunityRef: null
      }
    ]
  } as BoardroomOpportunityClassifierResultV1;

  const item = compileBoardroomOpportunityHandoffsV1({ classification: tampered }).items[0];
  assert.equal(item.bridgeDisposition, "NEEDS_VERIFICATION");
  assert.equal(item.handoff?.disposition, "NEEDS_VERIFICATION");
  assert.ok(item.reasonCodes.includes("LINK_ACTION_WITHOUT_EXPLICIT_OPPORTUNITY_REF"));
  assert.notEqual(item.handoff?.disposition, "READY_FOR_CANONICAL_UPSERT");
});

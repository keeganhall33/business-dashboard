import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBoardroomOpportunitiesV1,
  type BoardroomOpportunityClassifierResultV1,
  type BoardroomStoryV1
} from "@/lib/discovery-intelligence/boardroom-opportunity-classifier-v1";
import {
  projectBoardroomOpportunitiesToIntakeV1
} from "@/lib/relationship-intelligence/boardroom-opportunity-intake-projection-v1";
import {
  normalizeOpportunitySignalsV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

const CLASSIFIED_AT = "2026-09-18T18:00:00.000Z";
const PROJECTED_AT = "2026-09-18T18:05:00.000Z";

function story(overrides: Partial<BoardroomStoryV1> = {}): BoardroomStoryV1 {
  return {
    storyId: "story:sponsor-1",
    title: "Brand signs sponsorship with sports property",
    summary: "The sponsorship includes a new fan activation program.",
    publishedAt: "2026-09-18T17:00:00.000Z",
    sourceRef: "boardroom:newsletter:2026-09-18:story-1",
    evidenceRefs: ["evidence:boardroom:story-1"],
    evidenceState: "KNOWN",
    entityRefs: [],
    organizationRefs: ["org:brand-a"],
    syndicationKey: "brand-a-sports-property-sponsorship",
    ...overrides
  };
}

function classify(stories: readonly BoardroomStoryV1[], maximumEvidenceAgeDays = 30) {
  return classifyBoardroomOpportunitiesV1({
    stories,
    now: CLASSIFIED_AT,
    maximumEvidenceAgeDays,
    maximumSurfaced: 20
  });
}

function project(classifier: BoardroomOpportunityClassifierResultV1 = classify([story()])) {
  return projectBoardroomOpportunitiesToIntakeV1({
    projectedAt: PROJECTED_AT,
    classifier
  });
}

test("projects a known Boardroom sponsorship candidate into structured intake without inventing interest or access", () => {
  const result = project();

  assert.equal(result.status, "READY");
  assert.equal(result.observations.length, 1);
  assert.equal(result.records[0].disposition, "EMITTED");

  const observation = result.observations[0];
  assert.equal(observation.sourceKind, "BOARDROOM");
  assert.equal(observation.signalType, "SPONSORSHIP_OPPORTUNITY");
  assert.equal(observation.truthState, "KNOWN");
  assert.equal(observation.organizationRef, "org:brand-a");
  assert.equal(observation.personRef, null);
  assert.equal(observation.opportunityRef, null);
  assert.equal(observation.planningWindow, null);
  assert.equal(observation.decisionMakerClaim, null);
  assert.equal(observation.sponsorshipRelationshipClaim, null);
  assert.equal(observation.warmAccessClaim, null);

  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("never chooses a sponsor, buyer, or target organization when the story supplies multiple organizations", () => {
  const result = project(classify([
    story({ organizationRefs: ["org:brand-a", "org:sports-property"] })
  ]));

  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].organizationRef, null);
  assert.ok(result.records[0].reasonCodes.includes("MULTIPLE_ORGANIZATIONS_AMBIGUOUS_NO_ORGANIZATION_SELECTED"));
});

test("does not convert untyped Boardroom entity refs into people, decision makers, relationships, or warm access", () => {
  const result = project(classify([
    story({
      storyId: "story:executive-move",
      syndicationKey: "executive-move",
      title: "Sports company appoints new CMO",
      summary: "The company appoints a new CMO to lead marketing and partnerships.",
      entityRefs: ["person:new-cmo"],
      organizationRefs: ["org:sports-company"]
    })
  ]));

  const observation = result.observations[0];
  assert.equal(observation.signalType, "DECISION_MAKER_CHANGE");
  assert.equal(observation.organizationRef, "org:sports-company");
  assert.equal(observation.personRef, null);
  assert.equal(observation.decisionMakerClaim, null);
  assert.equal(observation.warmAccessClaim, null);
  assert.equal(observation.sponsorshipRelationshipClaim, null);
  assert.ok(result.records[0].reasonCodes.includes("UNTYPED_ENTITY_REFS_NOT_PROJECTED_TO_PERSON"));
});

test("preserves only an exact existing opportunity ref supplied by the classifier", () => {
  const result = project(classify([
    story({
      existingOpportunityRef: "opportunity:arena-club",
      title: "Arena partner expands collectibles licensing",
      summary: "The company announced a new licensed trading cards partnership.",
      organizationRefs: ["org:arena-partner"]
    })
  ]));

  const observation = result.observations[0];
  assert.equal(observation.opportunityRef, "opportunity:arena-club");
  assert.ok(result.records[0].reasonCodes.includes("EXACT_EXISTING_OPPORTUNITY_REF_PRESERVED"));

  const normalized = normalizeOpportunitySignalsV1({
    evaluatedAt: PROJECTED_AT,
    observations: result.observations
  });
  assert.equal(normalized.decisions.length, 1);
  assert.equal(normalized.decisions[0].canonicalOpportunityRef, "opportunity:arena-club");
  assert.equal(normalized.decisions[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(normalized.decisions[0].budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(normalized.decisions[0].dealLikelihood, "NOT_ESTABLISHED");
});

test("maps stale-by-age classifier evidence to STALE even when the original story state was KNOWN", () => {
  const staleClassifier = classifyBoardroomOpportunitiesV1({
    stories: [story({
      storyId: "story:old-sponsor",
      syndicationKey: "old-sponsor",
      publishedAt: "2026-07-01T12:00:00.000Z"
    })],
    now: CLASSIFIED_AT,
    maximumEvidenceAgeDays: 30
  });
  const result = project(staleClassifier);

  assert.equal(result.observations[0].truthState, "STALE");
  assert.equal(result.records[0].projectedTruthState, "STALE");
});

test("maps inferred and partial evidence to PARTIAL instead of upgrading it to known", () => {
  const result = project(classify([
    story({ storyId: "story:inferred", syndicationKey: "inferred", evidenceState: "INFERRED" }),
    story({ storyId: "story:partial", syndicationKey: "partial", evidenceState: "PARTIAL" })
  ]));

  assert.equal(result.observations.length, 2);
  assert.deepEqual(result.observations.map((item) => item.truthState), ["PARTIAL", "PARTIAL"]);
});

test("suppresses ignored noise and syndicated duplicates instead of creating duplicate opportunity observations", () => {
  const classifier = classify([
    story({
      storyId: "story:score",
      syndicationKey: "score",
      title: "Seattle wins the game",
      summary: "Final score and highlights from the matchup.",
      organizationRefs: []
    }),
    story({ storyId: "story:newer", publishedAt: "2026-09-18T17:30:00.000Z" }),
    story({ storyId: "story:older", publishedAt: "2026-09-18T16:30:00.000Z" })
  ]);
  const result = project(classifier);

  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].sourceEventKey, "boardroom-story:story:newer");
  const suppressed = result.records.filter((record) => record.disposition === "SUPPRESSED");
  assert.equal(suppressed.length, 2);
  assert.ok(suppressed.every((record) => record.reasonCodes.includes("CLASSIFIER_DECISION_SUPPRESSED")));
});

test("does not manufacture a planning window from publication time, why-now narrative, event, or venue language", () => {
  const result = project(classify([
    story({
      storyId: "story:event",
      syndicationKey: "event",
      title: "Historic venue announces anniversary gala",
      summary: "The stadium announced anniversary programming for a future celebration.",
      organizationRefs: ["org:historic-venue"]
    })
  ]));

  assert.equal(result.observations[0].planningWindow, null);
  assert.ok(result.records[0].reasonCodes.includes("NO_PLANNING_WINDOW_PROJECTED_FROM_BOARDROOM_NARRATIVE"));
});

test("fails a tampered link claim to verification instead of projecting it", () => {
  const clean = classify([story()]);
  const original = clean.decisions[0];
  const tampered: BoardroomOpportunityClassifierResultV1 = {
    ...clean,
    decisions: [{
      ...original,
      existingOpportunityRef: "opportunity:invented-link",
      recommendedAction: "RESEARCH"
    }]
  };

  const result = project(tampered);
  assert.equal(result.observations.length, 0);
  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.records[0].reasonCodes.includes("VERIFY:EXISTING_OPPORTUNITY_REF_WITHOUT_LINK_ACTION"));
});

test("blocks stale or future classifier projections and any claimed side effects", () => {
  const clean = classify([story()]);

  const stale = projectBoardroomOpportunitiesToIntakeV1({
    projectedAt: "2026-09-18T22:00:00.000Z",
    maximumClassifierAgeMinutes: 60,
    classifier: clean
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["CLASSIFIER_PROJECTION_STALE"]);
  assert.deepEqual(stale.observations, []);

  const future: BoardroomOpportunityClassifierResultV1 = {
    ...clean,
    generatedAt: "2026-09-18T19:00:00.000Z"
  };
  const futureResult = project(future);
  assert.equal(futureResult.status, "BLOCKED");
  assert.deepEqual(futureResult.issues, ["CLASSIFIER_GENERATED_IN_FUTURE"]);

  const sideEffect = {
    ...clean,
    externalResearchPerformed: true
  } as unknown as BoardroomOpportunityClassifierResultV1;
  const sideEffectResult = project(sideEffect);
  assert.equal(sideEffectResult.status, "BLOCKED");
  assert.ok(sideEffectResult.issues.includes("CLASSIFIER_EXTERNAL_RESEARCH_SIDE_EFFECT_DETECTED"));
});

test("rejects duplicate story identities rather than double-counting the same Boardroom event", () => {
  const clean = classify([story()]);
  const duplicated: BoardroomOpportunityClassifierResultV1 = {
    ...clean,
    decisions: [clean.decisions[0], clean.decisions[0]]
  };

  assert.throws(() => project(duplicated), /duplicate storyId/);
});

test("is deterministic, deeply immutable, and grants zero mutation or external-action authority", () => {
  const classifier = classify([story()]);
  const first = project(classifier);
  const second = project(classifier);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.records), true);
  assert.equal(Object.isFrozen(first.observations), true);
  assert.equal(Object.isFrozen(first.observations[0]), true);
  assert.equal(first.authority.crmMutationAuthorized, false);
  assert.equal(first.authority.relationshipMutationAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
});

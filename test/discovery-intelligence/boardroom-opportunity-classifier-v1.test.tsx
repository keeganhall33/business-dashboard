import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBoardroomOpportunitiesV1,
  type BoardroomStoryV1,
  type BoardroomTruthStateV1
} from "../../src/lib/discovery-intelligence/boardroom-opportunity-classifier-v1";

const NOW = "2026-09-18T04:00:00.000Z";

function story(overrides: Partial<BoardroomStoryV1> = {}): BoardroomStoryV1 {
  return {
    storyId: "story-1",
    title: "Global brand signs sponsorship with major sports property",
    summary: "The multi-year sponsorship includes fan activation and new partnership programming.",
    publishedAt: "2026-09-17T18:00:00.000Z",
    sourceRef: "boardroom:story-1",
    evidenceRefs: ["evidence:story-1"],
    evidenceState: "KNOWN",
    entityRefs: ["entity:athlete"],
    organizationRefs: ["org:brand", "org:property"],
    syndicationKey: "global-brand-sponsorship",
    ...overrides
  };
}

function classify(stories: readonly BoardroomStoryV1[], maximumSurfaced = 8) {
  return classifyBoardroomOpportunitiesV1({ stories, now: NOW, maximumSurfaced });
}

test("qualifies an evidence-backed sponsorship story for research", () => {
  const result = classify([story()]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "QUALIFIED_FOR_RESEARCH");
  assert.equal(decision.recommendedAction, "RESEARCH");
  assert.equal(decision.signalClass, "SPONSORSHIP");
  assert.equal(decision.opportunityClass, "SPONSOR_LED_ACTIVATION");
  assert.deepEqual(decision.fitReasons, ["SPORTS_BUSINESS", "BRAND_PARTNERSHIP"]);
  assert.equal(decision.evidenceSupport, "STRONG");
});

test("qualifies athlete-brand and collectibles/licensing signals without inventing access or economics", () => {
  const athlete = story({
    storyId: "athlete-deal",
    syndicationKey: "athlete-deal",
    title: "Athlete signs endorsement deal with apparel brand",
    summary: "The athlete signs a deal with the brand and will serve as an ambassador.",
    entityRefs: ["entity:athlete"],
    organizationRefs: ["org:apparel"]
  });
  const collectibles = story({
    storyId: "collectibles",
    syndicationKey: "collectibles",
    title: "League expands licensed trading cards program",
    summary: "The licensing agreement adds a new collectibles release window.",
    entityRefs: [],
    organizationRefs: ["org:league"]
  });
  const result = classify([athlete, collectibles]);

  assert.equal(result.decisions.find((item) => item.storyId === "athlete-deal")?.signalClass, "ATHLETE_TALENT_DEAL");
  assert.equal(result.decisions.find((item) => item.storyId === "collectibles")?.signalClass, "COLLECTIBLES_LICENSING");
  for (const decision of result.decisions) {
    assert.equal("accessPath" in decision, false);
    assert.equal("budget" in decision, false);
    assert.equal("economics" in decision, false);
  }
});

test("treats an executive move as a bounded relationship research candidate", () => {
  const result = classify([
    story({
      storyId: "executive-move",
      syndicationKey: "executive-move",
      title: "Sports company appoints new CMO",
      summary: "The company appoints a new CMO to lead marketing and partnerships.",
      entityRefs: ["person:new-cmo"],
      organizationRefs: ["org:sports-company"]
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "CANDIDATE");
  assert.equal(decision.signalClass, "EXECUTIVE_MOVE");
  assert.equal(decision.opportunityClass, "RELATIONSHIP_RESEARCH");
  assert.deepEqual(decision.fitReasons, ["DECISION_MAKER_CHANGE"]);
  assert.equal(decision.recommendedAction, "RESEARCH");
});

test("suppresses irrelevant sports results and generic celebrity mentions", () => {
  const result = classify([
    story({
      storyId: "score",
      syndicationKey: "score",
      title: "Seattle wins the game",
      summary: "Final score and highlights from last night's matchup.",
      entityRefs: ["entity:team"],
      organizationRefs: []
    }),
    story({
      storyId: "celebrity",
      syndicationKey: "celebrity",
      title: "Celebrity spotted at basketball game",
      summary: "A famous actor attended the game and greeted fans.",
      entityRefs: ["entity:celebrity"],
      organizationRefs: []
    })
  ]);

  assert.deepEqual(result.decisions.map((item) => item.disposition), ["IGNORE", "IGNORE"]);
  assert.equal(result.surfaced.length, 0);
});

test("surfaces charity and event signals without upgrading them into invented commitments", () => {
  const result = classify([
    story({
      storyId: "charity",
      syndicationKey: "charity",
      title: "Foundation announces benefit gala",
      summary: "The charity foundation will host a fundraiser and benefit gala this fall.",
      entityRefs: [],
      organizationRefs: ["org:foundation"]
    }),
    story({
      storyId: "anniversary",
      syndicationKey: "anniversary",
      title: "Historic stadium prepares for 100th anniversary",
      summary: "The venue announced an anniversary celebration and programming calendar.",
      entityRefs: [],
      organizationRefs: ["org:stadium"]
    })
  ]);

  const charity = result.decisions.find((item) => item.storyId === "charity");
  const anniversary = result.decisions.find((item) => item.storyId === "anniversary");
  assert.equal(charity?.signalClass, "CHARITY");
  assert.equal(charity?.disposition, "QUALIFIED_FOR_RESEARCH");
  assert.equal(anniversary?.signalClass, "VENUE");
  assert.equal(anniversary?.disposition, "CANDIDATE");
});

test("deduplicates syndicated versions deterministically", () => {
  const result = classify([
    story({ storyId: "older-copy", publishedAt: "2026-09-17T12:00:00Z" }),
    story({ storyId: "newer-copy", publishedAt: "2026-09-17T20:00:00Z" })
  ]);

  const newer = result.decisions.find((item) => item.storyId === "newer-copy");
  const older = result.decisions.find((item) => item.storyId === "older-copy");
  assert.equal(newer?.disposition, "QUALIFIED_FOR_RESEARCH");
  assert.equal(older?.disposition, "IGNORE");
  assert.equal(older?.duplicateOfStoryId, "newer-copy");
  assert.ok(older?.reasonCodes.includes("DUPLICATE_OR_SYNDICATED"));
});

test("links a supplied canonical opportunity instead of creating duplicate research intent", () => {
  const result = classify([
    story({
      storyId: "linked",
      syndicationKey: "linked",
      existingOpportunityRef: "opportunity:arena-club",
      title: "Arena partner expands collectibles licensing",
      summary: "The company announced a new licensed trading cards partnership."
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "CANDIDATE");
  assert.equal(decision.recommendedAction, "LINK_TO_EXISTING");
  assert.equal(decision.existingOpportunityRef, "opportunity:arena-club");
  assert.ok(decision.reasonCodes.includes("EXISTING_OPPORTUNITY_LINK_SUPPLIED"));
});

test("preserves partial, inferred, unknown, stale, and conflicted evidence as watch states", () => {
  const states: BoardroomTruthStateV1[] = ["PARTIAL", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"];
  const result = classify(states.map((evidenceState, index) => story({
    storyId: `state-${evidenceState}`,
    syndicationKey: `state-${evidenceState}-${index}`,
    evidenceState
  })));

  for (const decision of result.decisions) {
    assert.equal(decision.disposition, "WATCH");
    assert.equal(decision.recommendedAction, "WATCH");
    assert.notEqual(decision.evidenceSupport, "STRONG");
  }
});

test("treats otherwise strong old evidence as stale instead of actionable", () => {
  const result = classifyBoardroomOpportunitiesV1({
    stories: [story({ storyId: "old", syndicationKey: "old", publishedAt: "2026-06-01T12:00:00Z" })],
    now: NOW,
    maximumEvidenceAgeDays: 30
  });

  assert.equal(result.decisions[0].disposition, "WATCH");
  assert.ok(result.decisions[0].reasonCodes.includes("STALE_EVIDENCE"));
});

test("orders surfaced decisions deterministically and enforces the cap", () => {
  const result = classify([
    story({ storyId: "candidate", syndicationKey: "candidate", title: "Venue announces anniversary", summary: "The stadium announced anniversary programming." }),
    story({ storyId: "qualified-old", syndicationKey: "qualified-old", publishedAt: "2026-09-17T10:00:00Z" }),
    story({ storyId: "qualified-new", syndicationKey: "qualified-new", publishedAt: "2026-09-17T22:00:00Z" })
  ], 2);

  assert.deepEqual(result.surfaced.map((item) => item.storyId), ["qualified-new", "qualified-old"]);
  assert.equal(result.counts.surfaced, 2);
});

test("is immutable, deterministic, and performs zero external side effects", () => {
  const input = { stories: [story()], now: NOW } as const;
  const first = classifyBoardroomOpportunitiesV1(input);
  const second = classifyBoardroomOpportunitiesV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
});

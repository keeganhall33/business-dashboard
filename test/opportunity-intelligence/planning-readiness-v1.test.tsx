import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateOpportunityPlanningReadinessV1,
  type OpportunityPlanningReadinessInputV1
} from "@/lib/opportunity-intelligence/planning-readiness-v1";

const NOW = "2026-09-08T18:10:00.000Z";
const DETECTED = "2026-09-08T18:10:00.000Z";

function isoDaysAfter(days: number): string {
  return new Date(Date.parse(DETECTED) + days * 86_400_000).toISOString();
}

function baseInput(overrides: Partial<OpportunityPlanningReadinessInputV1> = {}): OpportunityPlanningReadinessInputV1 {
  return {
    opportunityId: "opportunity-1",
    now: NOW,
    detectedAt: DETECTED,
    engageBy: isoDaysAfter(30),
    deliverBy: isoDaysAfter(120),
    planningSignalClass: "ATHLETE_BRAND_CAMPAIGN",
    artworkClass: "STANDARD_ORIGINAL",
    productionWindowDays: { minDays: 45, maxDays: 75 },
    capacityFit: "FIT",
    differentiationRole: "STRATEGIC_COLLABORATOR",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "YES",
      smallerFasterWorkOption: "YES"
    },
    strategicUpside: {
      access: "HIGH",
      prestige: "HIGH",
      relationship: "HIGH",
      charityImpact: "LOW"
    },
    collectibles: {
      genericSketchCard: "NO",
      differentiatedRecurringPlatform: "NO",
      licensingAdvantage: "NO",
      marqueeRelationshipAccess: "NO"
    },
    evidenceRefs: ["evidence-b", "evidence-a"],
    truthState: "KNOWN",
    ...overrides
  };
}

test("9-month museum opportunity is preserved as early eligible planning work when fit evidence supports it", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "museum-nine-months",
    planningSignalClass: "MUSEUM_EXHIBITION",
    deliverBy: isoDaysAfter(273),
    engageBy: isoDaysAfter(90),
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 120, maxDays: 210 },
    capacityFit: "FIT",
    differentiationRole: "EXCLUSIVE_OR_FEATURED_ARTIST"
  }));

  assert.equal(result.planningRunwayDays, 273);
  assert.equal(result.planningRunwayBucket, "SIX_TO_TWELVE_MONTHS");
  assert.equal(result.missedPlanningWindow, false);
  assert.equal(result.eligibility, "PREPARE_EARLY");
  assert.equal(result.productionDemand, "HIGH");
});

test("6-month athlete brand campaign remains an eligible preparation state", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "athlete-six-months",
    deliverBy: isoDaysAfter(181),
    engageBy: isoDaysAfter(60),
    productionWindowDays: { minDays: 60, maxDays: 100 },
    capacityFit: "TIGHT"
  }));

  assert.equal(result.planningRunwayDays, 181);
  assert.equal(result.planningRunwayBucket, "SIX_TO_TWELVE_MONTHS");
  assert.equal(result.eligibility, "PREPARE_EARLY");
  assert.equal(result.missedPlanningWindow, false);
});

test("17-day festival requiring a major original is a proven missed planning window and deprioritized", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "festival-seventeen-days",
    planningSignalClass: "EVENT_FESTIVAL",
    deliverBy: isoDaysAfter(17),
    engageBy: isoDaysAfter(3),
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 75, maxDays: 150 },
    capacityFit: "NOT_FIT",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    }
  }));

  assert.equal(result.planningRunwayDays, 17);
  assert.equal(result.planningRunwayBucket, "LT_30_DAYS");
  assert.equal(result.missedPlanningWindow, true);
  assert.equal(result.eligibility, "DEPRIORITIZE");
  assert.match(result.reasons.join(" "), /MISSED_PLANNING_WINDOW/);
});

test("short-window existing-art activation remains actionable when capacity fits", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "existing-art-fast",
    planningSignalClass: "EVENT_FESTIVAL",
    deliverBy: isoDaysAfter(12),
    engageBy: isoDaysAfter(4),
    artworkClass: "EXISTING_ARTWORK",
    productionWindowDays: { minDays: 0, maxDays: 5 },
    capacityFit: "FIT"
  }));

  assert.equal(result.missedPlanningWindow, false);
  assert.equal(result.minimumViableActivation, "EXISTING_ARTWORK_ACTIVATION");
  assert.equal(result.productionDemand, "NONE");
  assert.equal(result.eligibility, "ACTIONABLE");
});

test("crowded multi-artist gallery is deprioritized without exceptional supported upside", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "crowded-gallery",
    planningSignalClass: "GALLERY_OPEN_CALL",
    differentiationRole: "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS",
    artworkClass: "STANDARD_ORIGINAL",
    strategicUpside: {
      access: "LOW",
      prestige: "LOW",
      relationship: "LOW",
      charityImpact: "LOW"
    },
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "NO",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    }
  }));

  assert.equal(result.crowdingRisk, "HIGH");
  assert.equal(result.eligibility, "DEPRIORITIZE");
  assert.match(result.reasons.join(" "), /commodity|crowded/i);
});

test("charity original-sale plus donated-print-proceeds structure can remain strategically attractive", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "charity-sale-plus-prints",
    planningSignalClass: "CHARITY_BENEFIT",
    economics: {
      originalSaleAllowed: "YES",
      printProceedsDonation: "YES",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "YES"
    },
    strategicUpside: {
      access: "MEDIUM",
      prestige: "MEDIUM",
      relationship: "HIGH",
      charityImpact: "HIGH"
    }
  }));

  assert.equal(result.netStrategicEconomics, "ATTRACTIVE");
  assert.notEqual(result.eligibility, "DEPRIORITIZE");
  assert.match(result.reasons.join(" "), /original-sale economics/i);
});

test("months-long donated original with weak upside and no cost recovery is unattractive", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "donated-major-original",
    planningSignalClass: "CHARITY_BENEFIT",
    artworkClass: "MAJOR_ORIGINAL",
    productionWindowDays: { minDays: 120, maxDays: 240 },
    deliverBy: isoDaysAfter(240),
    economics: {
      originalSaleAllowed: "NO",
      printProceedsDonation: "YES",
      sponsorUnderwriting: "NO",
      artistFeeCostRecovery: "NO",
      smallerFasterWorkOption: "NO"
    },
    strategicUpside: {
      access: "LOW",
      prestige: "LOW",
      relationship: "LOW",
      charityImpact: "MEDIUM"
    }
  }));

  assert.equal(result.netStrategicEconomics, "UNATTRACTIVE");
  assert.equal(result.eligibility, "DEPRIORITIZE");
});

test("generic sketch-card opportunity is not strategic by itself", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "generic-sketch-card",
    planningSignalClass: "COLLECTIBLES_PLATFORM",
    artworkClass: "SMALL_FAST_ORIGINAL",
    productionWindowDays: { minDays: 2, maxDays: 7 },
    differentiationRole: "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS",
    collectibles: {
      genericSketchCard: "YES",
      differentiatedRecurringPlatform: "NO",
      licensingAdvantage: "NO",
      marqueeRelationshipAccess: "NO"
    },
    strategicUpside: {
      access: "LOW",
      prestige: "LOW",
      relationship: "LOW",
      charityImpact: "LOW"
    }
  }));

  assert.equal(result.netStrategicEconomics, "UNATTRACTIVE");
  assert.equal(result.eligibility, "DEPRIORITIZE");
  assert.match(result.reasons.join(" "), /Generic sketch-card/i);
});

test("differentiated recurring collectibles platform can become attractive and eligible", () => {
  const result = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "recurring-collectibles-platform",
    planningSignalClass: "COLLECTIBLES_PLATFORM",
    artworkClass: "SMALL_FAST_ORIGINAL",
    productionWindowDays: { minDays: 3, maxDays: 10 },
    differentiationRole: "STRATEGIC_COLLABORATOR",
    collectibles: {
      genericSketchCard: "YES",
      differentiatedRecurringPlatform: "YES",
      licensingAdvantage: "YES",
      marqueeRelationshipAccess: "YES"
    },
    strategicUpside: {
      access: "HIGH",
      prestige: "MEDIUM",
      relationship: "HIGH",
      charityImpact: "LOW"
    }
  }));

  assert.equal(result.netStrategicEconomics, "ATTRACTIVE");
  assert.equal(result.eligibility, "PREPARE_EARLY");
  assert.match(result.reasons.join(" "), /Differentiated recurring|licensing|access/i);
});

test("UNKNOWN STALE and CONFLICTED material truth never collapses into false actionability", () => {
  for (const truthState of ["UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const result = evaluateOpportunityPlanningReadinessV1(baseInput({
      opportunityId: `truth-${truthState.toLowerCase()}`,
      truthState
    }));
    assert.equal(result.truthState, truthState);
    assert.equal(result.eligibility, "UNKNOWN");
    assert.equal(result.netStrategicEconomics, "UNKNOWN");
    assert.match(result.whatWouldChange.join(" "), /KNOWN evidence/i);
  }

  const unknownCapacity = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "unknown-capacity",
    capacityFit: "UNKNOWN"
  }));
  assert.equal(unknownCapacity.eligibility, "UNKNOWN");
  assert.notEqual(unknownCapacity.planningRunwayDays, 0);
});

test("exact planning runway bucket boundaries are deterministic", () => {
  const cases = [
    [29, "LT_30_DAYS"],
    [30, "ONE_TO_THREE_MONTHS"],
    [89, "ONE_TO_THREE_MONTHS"],
    [90, "THREE_TO_SIX_MONTHS"],
    [179, "THREE_TO_SIX_MONTHS"],
    [180, "SIX_TO_TWELVE_MONTHS"],
    [364, "SIX_TO_TWELVE_MONTHS"],
    [365, "TWELVE_PLUS_MONTHS"]
  ] as const;

  for (const [days, expected] of cases) {
    const result = evaluateOpportunityPlanningReadinessV1(baseInput({
      opportunityId: `runway-${days}`,
      engageBy: isoDaysAfter(Math.min(days, 10)),
      deliverBy: isoDaysAfter(days),
      artworkClass: "EXISTING_ARTWORK",
      productionWindowDays: { minDays: 0, maxDays: 1 }
    }));
    assert.equal(result.planningRunwayDays, days);
    assert.equal(result.planningRunwayBucket, expected);
  }

  const unknown = evaluateOpportunityPlanningReadinessV1(baseInput({
    opportunityId: "runway-unknown",
    engageBy: null,
    deliverBy: null,
    artworkClass: "EXISTING_ARTWORK",
    productionWindowDays: "UNKNOWN"
  }));
  assert.equal(unknown.planningRunwayDays, null);
  assert.equal(unknown.planningRunwayBucket, "UNKNOWN");
});

test("malformed future contradictory duplicate unsupported and invalid ranges fail closed", () => {
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1(baseInput({ detectedAt: "2026-09-09T18:10:00.000Z" })),
    /future-dated/i
  );
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1(baseInput({ detectedAt: "not-a-date" })),
    /valid timestamp/i
  );
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1(baseInput({ engageBy: isoDaysAfter(121), deliverBy: isoDaysAfter(120) })),
    /engageBy must not follow deliverBy/i
  );
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1(baseInput({ evidenceRefs: ["same", "same"] })),
    /duplicates/i
  );
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1({ ...baseInput(), secret: "no" } as unknown as OpportunityPlanningReadinessInputV1),
    /unsupported key/i
  );
  assert.throws(
    () => evaluateOpportunityPlanningReadinessV1({ ...baseInput(), artworkClass: "INSTANT_MASTERPIECE" } as unknown as OpportunityPlanningReadinessInputV1),
    /artworkClass is unsupported/i
  );
  for (const badRange of [
    { minDays: -1, maxDays: 10 },
    { minDays: 1.5, maxDays: 10 },
    { minDays: 1, maxDays: Number.POSITIVE_INFINITY },
    { minDays: 11, maxDays: 10 }
  ]) {
    assert.throws(
      () => evaluateOpportunityPlanningReadinessV1(baseInput({ productionWindowDays: badRange })),
      /productionWindowDays/i
    );
  }
});

test("evidence-ref permutations produce identical output and qualitative value never becomes fabricated dollars", () => {
  const first = evaluateOpportunityPlanningReadinessV1(baseInput({ evidenceRefs: ["evidence-c", "evidence-a", "evidence-b"] }));
  const second = evaluateOpportunityPlanningReadinessV1(baseInput({ evidenceRefs: ["evidence-b", "evidence-c", "evidence-a"] }));

  assert.deepEqual(second, first);
  assert.deepEqual(first.evidenceRefs, ["evidence-a", "evidence-b", "evidence-c"]);
  assert.doesNotMatch(JSON.stringify(first), /\$|revenue|profit|valuation/i);
});

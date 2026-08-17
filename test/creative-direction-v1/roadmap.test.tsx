import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEvidenceUpdate,
  getCreativeDirectionRoadmap,
  sortDirectionsByStage,
  toDashboardConsumableRoadmap
} from "@/lib/creative-direction-v1/roadmap";
import { CREATIVE_DIRECTION_CANDIDATE_REQUIRED_FIELDS } from "@/lib/creative-direction-v1/contracts";
import { creativeDirectionMarketBaselineCoverage } from "@/lib/creative-direction-v1/fixtures";

test("fixture contract includes market evidence metadata and five executable candidate directions", () => {
  const roadmap = getCreativeDirectionRoadmap();

  assert.equal(roadmap.dataMode, "FIXTURE_BASELINE");
  assert.equal(roadmap.directions.length, 5);
  assert.deepEqual(roadmap.stageOrder, ["KEEP_NOW", "TEST_NOW", "DEVELOP_NEXT", "DEFER", "AVOID"]);

  const evidenceClasses = new Set(roadmap.evidence.map((item) => item.signalClass));
  assert.ok(evidenceClasses.has("CURRENT_DEMAND"));
  assert.ok(evidenceClasses.has("LONG_TERM_PRESTIGE"));
  assert.ok(evidenceClasses.has("DIRECT_ARTIST"));
  assert.ok(evidenceClasses.has("COLLECTOR_BEHAVIOR"));

  for (const direction of roadmap.directions) {
    for (const field of CREATIVE_DIRECTION_CANDIDATE_REQUIRED_FIELDS) {
      const value = direction[field];
      assert.notEqual(value, undefined, `${direction.DIRECTION_ID} missing ${field}`);
      assert.notEqual(value, null, `${direction.DIRECTION_ID} null ${field}`);
      if (typeof value === "string") assert.ok(value.length > 0, `${direction.DIRECTION_ID} empty ${field}`);
      if (Array.isArray(value)) assert.ok(value.length > 0, `${direction.DIRECTION_ID} empty ${field}`);
    }
    assert.ok(direction.MATERIALS.length > 0);
    assert.ok(direction.COMPOSITION.length > 20);
    assert.ok(direction.PALETTE_COLOR_LOGIC.length > 20);
    assert.ok(direction.SUCCESS_CRITERIA.length >= 3);
    assert.ok(direction.WHAT_WOULD_CHANGE_THE_RECOMMENDATION.length >= 3);
    assert.ok(direction.evidenceIds.length > 0);
  }
});

test("market baseline fixture maps every required evidence class to cited metadata", () => {
  const roadmap = getCreativeDirectionRoadmap();
  const evidenceById = new Map(roadmap.evidence.map((item) => [item.evidenceId, item]));

  assert.deepEqual(Object.values(creativeDirectionMarketBaselineCoverage), [
    "evidence-art-basel-ubs-hnw-painting-demand",
    "evidence-auction-category-sculpture",
    "evidence-works-on-paper-collector-category",
    "evidence-younger-collector-digital-expansion",
    "evidence-direct-from-artist-expanded",
    "evidence-surrealism-market-strength"
  ]);

  for (const evidenceId of Object.values(creativeDirectionMarketBaselineCoverage)) {
    const evidence = evidenceById.get(evidenceId);
    assert.ok(evidence, `${evidenceId} is missing from roadmap evidence`);
    assert.ok(evidence.title.length > 20);
    assert.ok(evidence.publisher.length > 0);
    assert.ok(evidence.claimSummary.length > 40);
    assert.equal(evidence.provenance.collectionMethod, "FIXTURE_BASELINE");
    assert.match(evidence.provenance.citationLabel, /fixture/i);
  }
});

test("current market demand cannot automatically override long-term differentiation and prestige", () => {
  const roadmap = getCreativeDirectionRoadmap();
  const sculpture = roadmap.directions.find((direction) => direction.DIRECTION_ID === "cdv1-signature-relief-sculpture-translation");
  const surrealGraphite = roadmap.directions.find((direction) => direction.DIRECTION_ID === "cdv1-graphite-surreal-symbolic-environment");

  assert.ok(sculpture);
  assert.ok(surrealGraphite);
  assert.equal(sculpture.STAGE, "DEFER");
  assert.equal(surrealGraphite.STAGE, "DEVELOP_NEXT");
  assert.match(sculpture.CURRENT_MARKET_SIGNAL, /major physical medium/i);
  assert.match(surrealGraphite.LONG_TERM_PRESTIGE_SIGNAL, /proprietary visual language/i);
});

test("painting popularity alone cannot force a PAINT_NOW recommendation", () => {
  const roadmap = getCreativeDirectionRoadmap();
  const selectiveColor = roadmap.directions.find((direction) => direction.DIRECTION_ID === "cdv1-graphite-selective-material-color");

  assert.ok(selectiveColor);
  assert.equal(selectiveColor.STAGE, "TEST_NOW");
  assert.match(selectiveColor.CURRENT_MARKET_SIGNAL, /Painting\/color demand is noted/i);
  assert.ok(!roadmap.stageOrder.includes("PAINT_NOW" as never));
  assert.ok(selectiveColor.decisionNotes.some((note) => note.includes("Painting popularity alone cannot")));
});

test("qualitative prestige and brand value are not fabricated into dollars", () => {
  const roadmap = getCreativeDirectionRoadmap();

  for (const direction of roadmap.directions) {
    assert.match(direction.PRICE_CEILING_OR_ECONOMIC_NOTES, /No dollar|Do not fabricate|Do not infer/i);
    assert.doesNotMatch(direction.PRICE_CEILING_OR_ECONOMIC_NOTES, /\$[0-9]/);
  }
});

test("missing evidence widens uncertainty without silently changing stage", () => {
  const flagship = getCreativeDirectionRoadmap().directions[0];
  const result = applyEvidenceUpdate(flagship, {
    evidenceId: "missing-reference-clearance-proof",
    directionId: flagship.DIRECTION_ID,
    materiality: "MISSING_REQUIRED",
    signalClass: "RIGHTS_REFERENCE",
    claimSummary: "Reference clearance is unknown for the leading subject."
  });

  assert.equal(result.createdNewVersion, true);
  assert.equal(result.candidate.STAGE, flagship.STAGE);
  assert.equal(result.candidate.CONFIDENCE, "MEDIUM");
  assert.ok(result.candidate.CRITICAL_UNKNOWNS.includes("Reference clearance is unknown for the leading subject."));
});

test("noisy evidence does not create recommendation churn", () => {
  const flagship = getCreativeDirectionRoadmap().directions[0];
  const result = applyEvidenceUpdate(flagship, {
    evidenceId: "single-noisy-sale",
    directionId: flagship.DIRECTION_ID,
    materiality: "NOISY",
    signalClass: "CURRENT_DEMAND",
    claimSummary: "One adjacent sale appeared without clear relevance."
  });

  assert.equal(result.createdNewVersion, false);
  assert.deepEqual(result.candidate, flagship);
});

test("KEEP TEST DEVELOP DEFER AVOID ordering is deterministic and dashboard consumable", () => {
  const roadmap = getCreativeDirectionRoadmap();
  const sorted = sortDirectionsByStage([...roadmap.directions].reverse());

  assert.deepEqual(
    sorted.map((direction) => direction.STAGE),
    ["KEEP_NOW", "TEST_NOW", "DEVELOP_NEXT", "DEFER", "AVOID"]
  );

  const dashboard = toDashboardConsumableRoadmap(roadmap);
  assert.equal(dashboard.question, "WHAT SHOULD I MAKE NEXT?");
  assert.equal(dashboard.directions[0].directionId, "cdv1-graphite-flagship-evolution");
  assert.ok(dashboard.directions[0].specificArtworkRecommendation.materials.includes("graphite"));
  assert.ok(dashboard.directions[0].specificArtworkRecommendation.composition.length > 30);
  assert.ok(dashboard.directions[0].signals.evidenceIds.length > 0);
  assert.ok(dashboard.caveats.some((caveat) => caveat.includes("Current demand and long-term prestige are separate")));
});

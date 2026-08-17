import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CreativeDirectionWorkspace } from "@/components/creative-direction/CreativeDirectionWorkspace";
import { CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1 } from "@/lib/creative-direction/dashboard-refresh-fixtures";
import {
  CREATIVE_CONCEPT_COMPARISON_FIXTURE_V1,
  CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
  compareControlledVariables,
  conceptIsMarketEvidence,
  createVisualizationRequestFromRecommendation,
  recommendationConfidenceDeltaFromConceptAppeal
} from "@/lib/creative-direction/visualization-fixtures";

const directionFixture = CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1;
const visualization = {
  request: CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
  comparison: CREATIVE_CONCEPT_COMPARISON_FIXTURE_V1
};
const html = renderToString(<CreativeDirectionWorkspace data={directionFixture} visualization={visualization} />);

test("recommendation creates dashboard-consumable visualization request contract", () => {
  const request = createVisualizationRequestFromRecommendation({
    recommendation: directionFixture.current_recommendation,
    evidence: directionFixture.evidence.filter((item) => item.materiality === "MATERIAL")
  });

  assert.equal(request.ACTION_LABEL, "VISUALIZE THIS RECOMMENDATION");
  assert.equal(request.PARENT_RECOMMENDATION_VERSION, directionFixture.current_recommendation.version);
  assert.equal(request.evidence_guardrail, "GENERATED_CONCEPT_IS_NOT_MARKET_EVIDENCE");
  assert.equal(request.confidence_policy, "DO_NOT_INCREASE_RECOMMENDATION_CONFIDENCE_FROM_VISUAL_APPEAL");
  assert.ok(request.concepts.every((concept) => concept.PARENT_RECOMMENDATION_VERSION === directionFixture.current_recommendation.version));
});

test("three or more deterministic concept variants remain specific enough to execute", () => {
  assert.ok(visualization.request.concepts.length >= 3);
  for (const concept of visualization.request.concepts) {
    assert.ok(concept.CONCEPT_ID.length > 0);
    assert.ok(concept.MEDIUM.length > 0);
    assert.ok(concept.MATERIALS.length > 0);
    assert.ok(concept["DIMENSIONS/ASPECT"].length > 0);
    assert.ok(concept.COMPOSITION_SPEC.length > 20);
    assert.ok(concept.SUBJECT_SPEC.length > 20);
    assert.ok(concept.PALETTE_SPEC.length > 20);
    assert.ok(concept.LIGHTING_SPEC.length > 20);
    assert.ok(concept.TRANSFORMATION_MECHANISM.length > 20);
    assert.ok(concept.GENERATION_PROMPT_SPEC.includes("guardrail=concept study only"));
  }
});

test("controlled-variable comparison and isolate-regenerate state are deterministic", () => {
  const comparison = compareControlledVariables(visualization.request.concepts);
  assert.deepEqual(comparison["palette/selective-color logic"], ["concept-graphite-threshold-red-001"]);
  assert.ok(comparison["negative space"].includes("concept-graphite-void-blue-002"));
  assert.ok(comparison["material/relief/depth treatment"].includes("concept-graphite-relief-shadow-003"));
  assert.equal(visualization.comparison.next_regeneration_request.isolate_variable, "palette/selective-color logic");
  assert.match(visualization.comparison.next_regeneration_request.instruction, /More like this/);
});

test("concept lineage versioning and feedback state are preserved", () => {
  const relief = visualization.request.concepts.find((concept) => concept.CONCEPT_ID === "concept-graphite-relief-shadow-003");
  assert.ok(relief);
  assert.equal(relief.LINEAGE.version, 2);
  assert.equal(relief.LINEAGE.parent_concept_id, "concept-graphite-threshold-red-001");
  assert.ok(relief.LINEAGE.changed_from_parent.includes("physical depth"));
  assert.equal(relief.KEEGAN_FEEDBACK.human_reported_context_only, true);
  assert.equal(relief.KEEGAN_FEEDBACK.state, "LESS_LIKE_THIS");
});

test("generated concept appeal never becomes market evidence or confidence delta", () => {
  for (const concept of visualization.request.concepts) {
    assert.equal(conceptIsMarketEvidence(concept), false);
    assert.equal(recommendationConfidenceDeltaFromConceptAppeal(concept), 0);
    assert.match(concept.WHAT_THIS_VISUAL_DOES_NOT_PROVE.join(" "), /demand|validation|success|conversion|willingness/i);
  }
});

test("Creative Direction workspace renders light-first visualization UX", () => {
  for (const text of [
    "Creative visualization concept studies",
    "Generated concepts are not market evidence.",
    "Side-by-side comparison",
    "Pin / favorite / reject",
    "More like this / less like this",
    "Isolate one variable and regenerate",
    "Voice/text annotations are HUMAN_REPORTED preference context only.",
    "Compare concept to strategic recommendation/evidence without changing confidence.",
    "concept-graphite-threshold-red-001",
    "concept-graphite-void-blue-002",
    "concept-graphite-relief-shadow-003"
  ]) {
    assert.match(html, new RegExp(text.replaceAll("/", "\\/").replaceAll(".", "\\.")));
  }
  assert.match(html, /bg-\[#f7f2ea\]/);
  assert.match(html, /bg-amber-50/);
});

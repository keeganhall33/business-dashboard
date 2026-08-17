import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CreativeVisualizationPanel } from "@/components/creative-visualization/CreativeVisualizationPanel";
import {
  CREATIVE_VISUALIZATION_COMPARISON_SET_FIXTURE_V1,
  buildVisualizationRequestFromRecommendation,
  conceptConfidenceDeltaFromGeneratedImage,
  isolateControlledVariable
} from "@/lib/creative-visualization/fixtures";

const comparisonSet = CREATIVE_VISUALIZATION_COMPARISON_SET_FIXTURE_V1;
const html = renderToString(<CreativeVisualizationPanel comparisonSet={comparisonSet} />);

test("recommendation converts to deterministic visualization request", () => {
  const request = buildVisualizationRequestFromRecommendation({
    recommendationVersion: 2,
    directionId: "cdv1-graphite-surreal-symbolic-environment",
    evidenceIds: ["ev-institutional-drawing-validation", "ev-first-party-collector-graphite"]
  });

  assert.equal(request.prompt_intent, "VISUALIZE_THIS_RECOMMENDATION");
  assert.equal(request.parent_recommendation_version, "CreativeDirectionRecommendationVersion:2");
  assert.equal(request.concept_count, 4);
  assert.deepEqual(request.evidence_references, ["ev-first-party-collector-graphite", "ev-institutional-drawing-validation"]);
  assert.equal(request.confidence_change_policy, "NO_CONFIDENCE_CHANGE_FROM_GENERATED_IMAGE");
});

test("comparison set represents three or more controlled concept variants", () => {
  assert.equal(comparisonSet.concepts.length, 4);
  assert.ok(comparisonSet.comparison_axes.includes("composition"));
  assert.ok(comparisonSet.comparison_axes.includes("palette/selective-color logic"));
  assert.ok(comparisonSet.comparison_axes.includes("material/relief/depth treatment"));

  for (const concept of comparisonSet.concepts) {
    assert.ok(concept.CONCEPT_ID);
    assert.equal(concept.PARENT_RECOMMENDATION_VERSION, "CreativeDirectionRecommendationVersion:2");
    assert.ok(concept.GENERATION_PROMPT_SPEC.prompt.includes("Museum-grade graphite concept study"));
    assert.equal(concept.GENERATION_PROMPT_SPEC.provider_mode, "MOCKABLE_ADAPTER_ONLY");
    assert.ok(concept.CONTROLLED_VARIABLES.length >= 2);
    assert.ok(concept.WHAT_THIS_VISUAL_DOES_NOT_PROVE.some((item) => /not .*market evidence/i.test(item)));
  }
});

test("controlled-variable isolation preserves lineage and changes one dimension", () => {
  const source = comparisonSet.concepts[0];
  const isolated = isolateControlledVariable({ concept: source, variable: "composition" });

  assert.notEqual(isolated.CONCEPT_ID, source.CONCEPT_ID);
  assert.equal(isolated.CONTROLLED_VARIABLES.length, 1);
  assert.equal(isolated.CONTROLLED_VARIABLES[0].variable, "composition");
  assert.equal(isolated.lineage.at(-1)?.action, "VARIABLE_ISOLATION");
  assert.equal(isolated.lineage.at(-1)?.parent_concept_id, source.CONCEPT_ID);
  assert.match(isolated.NEXT_ITERATION, /changing only composition/i);
});

test("feedback remains human-reported preference rather than market truth", () => {
  const pinned = comparisonSet.concepts.find((concept) => concept.VISUALIZATION_STATUS === "PINNED");
  const rejected = comparisonSet.concepts.find((concept) => concept.VISUALIZATION_STATUS === "REJECTED");

  assert.ok(pinned);
  assert.equal(pinned.KEEGAN_FEEDBACK.learning_classification, "HUMAN_REPORTED_CREATIVE_PREFERENCE");
  assert.equal(pinned.KEEGAN_FEEDBACK.market_evidence_weight, "NONE");
  assert.ok(rejected);
  assert.equal(rejected.KEEGAN_FEEDBACK.state, "REJECTED");
});

test("generated concepts never increase strategic confidence", () => {
  assert.equal(conceptConfidenceDeltaFromGeneratedImage(), 0);
  assert.match(comparisonSet.epistemic_guardrail, /not market evidence/i);
  assert.match(comparisonSet.epistemic_guardrail, /not grounds for increasing strategic confidence/i);
});

test("light-first visualization panel renders dashboard controls and evidence boundary", () => {
  for (const text of [
    "Creative visualization",
    "Visualize this recommendation",
    "PIN",
    "FAVORITE",
    "REJECT",
    "ANNOTATE / VOICE",
    "ISOLATE / VARIABLE / REGENERATE",
    "Controlled-variable comparison",
    "Evidence boundary",
    "NO CONFIDENCE CHANGE FROM GENERATED IMAGE"
  ]) {
    assert.match(html, new RegExp(text.replaceAll("/", "\\/")));
  }
  assert.match(html, /4(?:<!-- -->)? concept studies/);
  assert.match(html, /bg-\[#fffdf8\]/);
  assert.doesNotMatch(html, /bg-zinc-950|bg-slate-950|text-zinc-100/);
});

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import OpportunitiesActionsPage from "@/app/(app)/opportunities-actions/page";
import {
  PLANNING_READINESS_OPPORTUNITY_FIXTURES_V1,
  PLANNING_READINESS_TRUTH_GUARDRAILS_V1,
  PlanningReadinessOpportunityPanelV1
} from "@/components/opportunity-intelligence/PlanningReadinessOpportunityPanelV1";

const fixtures = PLANNING_READINESS_OPPORTUNITY_FIXTURES_V1;
const html = renderToString(<PlanningReadinessOpportunityPanelV1 />);
const pageHtml = renderToString(<OpportunitiesActionsPage />);

test("workspace consumes the authoritative planning results for all nine bounded scenarios", () => {
  assert.equal(fixtures.length, 9);
  assert.deepEqual(fixtures.map((item) => item.result.opportunityId), [
    "museum-early",
    "athlete-brand",
    "late-major-original",
    "existing-art-short-window",
    "crowded-gallery",
    "charity-attractive",
    "charity-uncompensated",
    "generic-sketch-card",
    "recurring-collectibles"
  ]);
  assert.equal(fixtures.find((item) => item.result.opportunityId === "museum-early")?.result.eligibility, "PREPARE_EARLY");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "late-major-original")?.result.missedPlanningWindow, true);
  assert.equal(fixtures.find((item) => item.result.opportunityId === "existing-art-short-window")?.result.minimumViableActivation, "EXISTING_ARTWORK_ACTIVATION");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "crowded-gallery")?.result.crowdingRisk, "HIGH");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "charity-attractive")?.result.netStrategicEconomics, "ATTRACTIVE");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "charity-uncompensated")?.result.netStrategicEconomics, "UNATTRACTIVE");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "generic-sketch-card")?.result.eligibility, "DEPRIORITIZE");
  assert.equal(fixtures.find((item) => item.result.opportunityId === "recurring-collectibles")?.result.netStrategicEconomics, "ATTRACTIVE");
});

test("workspace renders runway production capacity differentiation activation and qualitative economics", () => {
  for (const label of ["Runway", "Production", "Capacity", "Minimum activation", "Differentiation", "Crowding risk", "Strategic upside and economics"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /MISSED WINDOW/);
  assert.match(html, /17 days/);
  assert.match(html, /EXISTING ARTWORK ACTIVATION/);
  assert.match(html, /ONE OF MANY INTERCHANGEABLE ARTISTS/);
  assert.match(html, /ATTRACTIVE/);
  assert.match(html, /UNATTRACTIVE/);
});

test("recommended timing explains why now and exposes evidence-backed change conditions", () => {
  assert.match(html, /Recommended timing/);
  assert.match(html, /Begin preparation before the window compresses/);
  assert.match(html, /Do not allocate scarce production capacity now/);
  assert.match(html, /Why now, evidence, and what would change/);
  assert.match(html, /What would change the recommendation/);
  assert.match(html, /evidence:late-major-original:timing/);
  assert.match(html, /later delivery date/i);
});

test("UNKNOWN STALE and CONFLICTED remain visibly non-actionable", () => {
  assert.deepEqual(PLANNING_READINESS_TRUTH_GUARDRAILS_V1.map((item) => item.truthState), ["UNKNOWN", "STALE", "CONFLICTED"]);
  for (const item of PLANNING_READINESS_TRUTH_GUARDRAILS_V1) {
    assert.equal(item.eligibility, "UNKNOWN");
    assert.equal(item.netStrategicEconomics, "UNKNOWN");
  }
  assert.match(html, /UNKNOWN · UNKNOWN · verify evidence/);
  assert.match(html, /STALE · UNKNOWN · verify evidence/);
  assert.match(html, /CONFLICTED · UNKNOWN · verify evidence/);
  assert.match(html, /cannot become a timing recommendation/);
});

test("workspace never invents financial certainty or exposes an action surface", () => {
  assert.match(html, /No invented revenue, price, buyer, or certainty/);
  assert.doesNotMatch(html, /\$[0-9]/);
  assert.doesNotMatch(html, />\s*Send\s*</i);
  assert.doesNotMatch(html, />\s*Schedule\s*</i);
  assert.doesNotMatch(html, /method="post"/i);
  assert.doesNotMatch(html, /<button/i);
});

test("opportunity page preserves ExecutiveWorkspacePage and adds responsive progressive disclosure", () => {
  assert.match(pageHtml, /Opportunities/);
  assert.match(pageHtml, /Choose the right work before the window closes/);
  assert.match(pageHtml, /data-visual-mode="light"/);
  assert.match(pageHtml, /<details/);
  assert.match(pageHtml, /sm:px-6/);
  assert.match(pageHtml, /md:grid-cols-2/);
  assert.match(pageHtml, /xl:grid-cols-3/);
});

test("fixtures and server rendering are deterministic", () => {
  assert.equal(renderToString(<PlanningReadinessOpportunityPanelV1 />), html);
  assert.deepEqual(fixtures.map((item) => item.result.evidenceRefs), fixtures.map((item) => [...item.result.evidenceRefs].sort()));
});

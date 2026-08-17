import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CreativeDirectionWorkspace } from "@/components/creative-direction/CreativeDirectionWorkspace";
import {
  CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1,
  createNextCreativeRecommendationVersion,
  executiveHomeCreativeDeltas,
  shouldCreateCreativeRecommendationRevision
} from "@/lib/creative-direction/dashboard-refresh-fixtures";

const fixture = CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1;
const html = renderToString(<CreativeDirectionWorkspace data={fixture} />);

test("Creative Direction workspace renders light-first dashboard-consumable sections", () => {
  for (const text of [
    "What should I make next?",
    "Current creative recommendation",
    "KEEP / NOW",
    "DEVELOP / NEXT",
    "Medium portfolio",
    "Specific artwork / series recommendations",
    "Composition / palette / scale / material / style detail",
    "Market signals",
    "Institutional signals",
    "Collector signals",
    "Peer / category map",
    "Open visual territory",
    "Creative experiments",
    "Creative learnings",
    "Creative visualization",
    "Visualize this recommendation",
    "Controlled-variable comparison",
    "Short path to goal",
    "What to stop / avoid",
    "Why this changed",
    "Recommendation version history"
  ]) {
    assert.match(html, new RegExp(text.replace("/", "\\/")));
  }
  assert.match(html, /bg-\[#f7f2ea\]/);
});

test("refresh states represent event weekly monthly and quarterly cadence deterministically", () => {
  assert.deepEqual(fixture.refresh_states.map((item) => item.cadence), [
    "EVENT_TRIGGERED",
    "WEEKLY_LIGHTWEIGHT_SCAN",
    "MONTHLY_FORMAL_REVIEW",
    "QUARTERLY_STRATEGY_RESET"
  ]);
});

test("material evidence creates a new visible recommendation version", () => {
  const previous = fixture.version_history[0];
  const material = fixture.evidence.filter((item) => item.materiality === "MATERIAL");
  const next = createNextCreativeRecommendationVersion({ previous, evidence: material });
  assert.ok(next);
  assert.equal(next.version, previous.version + 1);
  assert.equal(next.stage, "DEVELOP_NEXT");
  assert.equal(next.confidence, "HIGH");
  assert.ok(next.new_evidence_ids.includes("ev-first-party-collector-graphite"));
  assert.ok((next.why_changed ?? "").length > 0);
});

test("noisy evidence does not create recommendation churn", () => {
  const noisy = fixture.evidence.filter((item) => item.materiality === "NOISE");
  assert.equal(shouldCreateCreativeRecommendationRevision(noisy), false);
  assert.equal(createNextCreativeRecommendationVersion({ previous: fixture.current_recommendation, evidence: noisy }), null);
});

test("Executive Home receives only material creative-direction deltas", () => {
  assert.deepEqual(executiveHomeCreativeDeltas(fixture), fixture.executive_home_deltas);
  assert.match(fixture.executive_home_deltas.join(" "), /material collector\/institutional evidence/);
});

test("version history preserves before after evidence and changed assumptions", () => {
  assert.equal(fixture.version_history[0].version, 1);
  assert.equal(fixture.version_history[1].version, 2);
  assert.equal(fixture.version_history[0].stage, "KEEP_NOW");
  assert.equal(fixture.version_history[1].stage, "DEVELOP_NEXT");
  assert.ok(fixture.version_history[1].new_evidence_ids.length > 0);
  assert.ok(fixture.version_history[1].changed_assumptions.length > 0);
  assert.match(fixture.version_history[1].why_changed ?? "", /WHY|Material|changed/i);
});

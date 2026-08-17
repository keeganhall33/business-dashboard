import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { approvalTone, confidenceTone, freshnessTone, stateTone } from "@/components/executive-home/IntelligencePrimitives";
import { EXECUTIVE_HOME_FIXTURE_V1, cardsBySection } from "@/lib/executive-home/fixtures";

const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);

test("Executive Home renders light mode by default with warm canvas", () => {
  assert.match(html, /bg-\[#f7f2ea\]/);
  assert.match(html, /Light-first intelligence dashboard/);
  assert.match(html, /text-stone-950/);
  assert.doesNotMatch(html, /bg-zinc-950|bg-slate-950|text-zinc-100|text-white\/80/);
});

test("Executive Home includes every required intelligence section", () => {
  for (const label of [
    "What matters now",
    "What changed",
    "Do now / prepare / monitor",
    "Keegan action required",
    "Top opportunities",
    "Current hypotheses / experiments",
    "Learning since last review",
    "Data / coverage gaps"
  ]) {
    assert.match(html, new RegExp(label.replace("/", "\\/")));
  }
  assert.equal(cardsBySection("WHAT_MATTERS_NOW").length, 1);
  assert.equal(cardsBySection("DATA_COVERAGE_GAPS").length, 1);
});

test("cards expose WHY EVIDENCE NEXT ACTION through progressive disclosure", () => {
  assert.match(html, /WHY \/ EVIDENCE \/ NEXT ACTION/);
  assert.match(html, /Why:/);
  assert.match(html, /Evidence:/);
  assert.match(html, /Next action:/);
});

test("light-first primitives preserve semantic state distinction", () => {
  assert.equal(stateTone("FACT"), "emerald");
  assert.equal(stateTone("HYPOTHESIS"), "sky");
  assert.equal(stateTone("UNKNOWN"), "amber");
  assert.equal(stateTone("STALE"), "amber");
  assert.equal(stateTone("CONFLICTED"), "rose");
  assert.equal(confidenceTone("UNKNOWN"), "amber");
  assert.equal(freshnessTone("STALE"), "amber");
  assert.equal(approvalTone("KEEGAN_ACTION_REQUIRED"), "rose");
});

test("fixture preserves explicit UNKNOWN and non-required Keegan action state", () => {
  const unknown = EXECUTIVE_HOME_FIXTURE_V1.cards.find((card) => card.state === "UNKNOWN");
  assert.ok(unknown);
  assert.equal(unknown.confidence, "UNKNOWN");
  assert.equal(unknown.freshness, "UNKNOWN");
  assert.match(html, /Direct economics for prestige event concepts remain UNKNOWN/);
  assert.match(html, /No Keegan approval required in this fixture/);
});

test("loading empty and error placeholders are designed for light backgrounds", () => {
  assert.match(html, /Loading executive intelligence with provenance intact/);
  assert.match(html, /No material intelligence changes need attention right now/);
  assert.match(html, /Unable to verify executive intelligence/);
  assert.match(html, /Do not treat unavailable data as zero/);
});

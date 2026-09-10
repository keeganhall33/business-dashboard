import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import FinancialSpecialistPage from "@/app/(app)/specialists/financial/page";
import GoalsCapacitySpecialistPage from "@/app/(app)/specialists/goals-capacity/page";
import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import {
  getSpecialistCommandCenterCardsForModeV1,
  toSpecialistEvidenceFreshnessV1
} from "@/lib/executive-home/specialist-command-center";
import { getSpecialistCommandCenterCardsFixtureV1 } from "./support/specialist-command-center-fixture-adapter";

test("test-only specialist adapter returns exactly the deterministic Phase C entry cards", () => {
  const cards = getSpecialistCommandCenterCardsFixtureV1();

  assert.deepEqual(cards.map((card) => card.id), ["financial", "goals-capacity", "relationships"]);
  assert.ok(cards.every((card) => card.what_changed.length > 20));
  assert.ok(cards.every((card) => card.why_it_matters.length > 20));
  assert.ok(cards.every((card) => card.next_best_action.length > 20));
  assert.ok(cards.every((card) => card.material_gap_or_risk.length > 10));
  assert.ok(cards.every((card) => card.evidence.length > 10));
  assert.ok(cards.every((card) => card.evidence_freshness));
  assert.ok(cards.every((card) => card.evidence_context.freshness_detail.length > 20));
  assert.ok(cards.every((card) => card.evidence_context.source_label.length > 0));
  assert.equal(cards.filter((card) => card.decision_room_id).length, 1);
  assert.equal(cards.find((card) => card.id === "financial")?.decision_room_id, "decision-private-collector-room");
  assert.equal(cards.find((card) => card.id === "financial")?.approval_class, "L1_RECOMMENDATION");
});

test("production specialist selector has no fixture provider import", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/executive-home/specialist-command-center.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /(?:financial-intelligence|goals-portfolio-capacity|decision-room|relationship-intelligence)\/fixtures/);
});

test("fixture mode fails closed in the production specialist selector", () => {
  assert.deepEqual(getSpecialistCommandCenterCardsForModeV1("FIXTURE"), []);
});

test("freshness adapter distinguishes current stale conflicted and unknown without fake precision", () => {
  assert.equal(toSpecialistEvidenceFreshnessV1("KNOWN"), "CURRENT");
  assert.equal(toSpecialistEvidenceFreshnessV1("INFERRED"), "CURRENT");
  assert.equal(toSpecialistEvidenceFreshnessV1("STALE"), "STALE");
  assert.equal(toSpecialistEvidenceFreshnessV1("CONFLICTED"), "CONFLICTED");
  assert.equal(toSpecialistEvidenceFreshnessV1("UNKNOWN"), "UNKNOWN");
  assert.equal(toSpecialistEvidenceFreshnessV1("KNOWN", false), "UNKNOWN");
});

test("fixture command-center data cannot surface specialist fixture conclusions", () => {
  const html = renderToString(
    <ExecutiveCommandCenter
      data={EXECUTIVE_HOME_FIXTURE_V1.command_center}
      onOpenDecisionRoom={() => undefined}
    />
  );

  assert.match(html, /Specialist intelligence/);
  assert.match(html, /data-testid="specialist-production-unavailable"/);
  assert.match(html, /Specialist evidence unavailable/);
  assert.match(html, /fixture conclusions are intentionally withheld/);
  assert.doesNotMatch(html, /WHAT_CHANGED|WHY_IT_MATTERS|NEXT_BEST_ACTION/);
  assert.doesNotMatch(html, /Review in Decision Room/);
});

test("financial and goals drill-down pages render read-only specialist detail", () => {
  const financial = renderToString(<FinancialSpecialistPage />);
  const goals = renderToString(<GoalsCapacitySpecialistPage />);

  assert.match(financial, /Financial intelligence/);
  assert.match(financial, /Command-center summary/);
  assert.match(financial, /UNKNOWN direct costs/);
  assert.match(financial, /href="\/executive-home"/);

  assert.match(goals, /Goals \/ Capacity/);
  assert.match(goals, /UNAVAILABLE/);
  assert.match(goals, /UNKNOWN/);
  assert.match(goals, /No canonical production goals or capacity specialist snapshot is supplied to this surface\./);
  assert.match(goals, /Supply verified goals and capacity evidence before presenting portfolio pressure as current truth\./);
  assert.match(goals, /href="\/specialists"/);
  assert.match(goals, /href="\/data-evidence"/);
  assert.match(goals, /href="\/dashboard"/);
  assert.doesNotMatch(goals, /Command-center summary/);
  assert.doesNotMatch(goals, /Capacity conflicts remain visible/);
});

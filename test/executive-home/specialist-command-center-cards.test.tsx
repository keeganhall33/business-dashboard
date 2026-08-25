import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import FinancialSpecialistPage from "@/app/(app)/specialists/financial/page";
import GoalsCapacitySpecialistPage from "@/app/(app)/specialists/goals-capacity/page";
import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import { getSpecialistCommandCenterCardsV1, toSpecialistEvidenceFreshnessV1 } from "@/lib/executive-home/specialist-command-center";

test("specialist command-center adapter returns exactly the Phase C entry cards", () => {
  const cards = getSpecialistCommandCenterCardsV1();

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

test("freshness adapter distinguishes current stale conflicted and unknown without fake precision", () => {
  assert.equal(toSpecialistEvidenceFreshnessV1("KNOWN"), "CURRENT");
  assert.equal(toSpecialistEvidenceFreshnessV1("INFERRED"), "CURRENT");
  assert.equal(toSpecialistEvidenceFreshnessV1("STALE"), "STALE");
  assert.equal(toSpecialistEvidenceFreshnessV1("CONFLICTED"), "CONFLICTED");
  assert.equal(toSpecialistEvidenceFreshnessV1("UNKNOWN"), "UNKNOWN");
  assert.equal(toSpecialistEvidenceFreshnessV1("KNOWN", false), "UNKNOWN");
});

test("specialist cards keep mobile and desktop grid classes in the light command center", () => {
  const html = renderToString(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} onOpenDecisionRoom={() => undefined} />);

  assert.match(html, /Specialist intelligence/);
  assert.match(html, /grid gap-3 lg:grid-cols-3/);
  assert.match(html, /WHAT_CHANGED/);
  assert.match(html, /WHY_IT_MATTERS/);
  assert.match(html, /NEXT_BEST_ACTION/);
  assert.match(html, /EVIDENCE/);
  assert.match(html, /FRESHNESS/);
  assert.match(html, /aria-label="Financial evidence freshness UNKNOWN"/);
  assert.match(html, /aria-label="Goals \/ Capacity evidence freshness UNKNOWN"/);
  assert.match(html, /aria-label="Relationships evidence freshness UNKNOWN"/);
  assert.match(html, /Review in Decision Room/);
  assert.match(html, /bg-white/);
  assert.doesNotMatch(html, /bg-zinc-950|bg-slate-950/);
});

test("financial and goals drill-down pages render read-only specialist detail", () => {
  const financial = renderToString(<FinancialSpecialistPage />);
  const goals = renderToString(<GoalsCapacitySpecialistPage />);

  assert.match(financial, /Financial intelligence/);
  assert.match(financial, /Command-center summary/);
  assert.match(financial, /UNKNOWN direct costs/);
  assert.match(financial, /href="\/executive-home"/);

  assert.match(goals, /Goals \/ Capacity/);
  assert.match(goals, /Command-center summary/);
  assert.match(goals, /Capacity conflicts remain visible/);
  assert.match(goals, /href="\/executive-home"/);
});

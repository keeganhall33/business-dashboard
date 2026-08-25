import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import FinancialSpecialistPage from "@/app/(app)/specialists/financial/page";
import GoalsCapacitySpecialistPage from "@/app/(app)/specialists/goals-capacity/page";
import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import { getSpecialistCommandCenterCardsV1 } from "@/lib/executive-home/specialist-command-center";

test("specialist command-center adapter returns exactly the Phase C entry cards", () => {
  const cards = getSpecialistCommandCenterCardsV1();

  assert.deepEqual(cards.map((card) => card.id), ["financial", "goals-capacity", "relationships"]);
  assert.ok(cards.every((card) => card.what_changed.length > 20));
  assert.ok(cards.every((card) => card.why_it_matters.length > 20));
  assert.ok(cards.every((card) => card.next_best_action.length > 20));
  assert.ok(cards.every((card) => card.material_gap_or_risk.length > 10));
});

test("specialist cards keep mobile and desktop grid classes in the light command center", () => {
  const html = renderToString(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);

  assert.match(html, /Specialist intelligence/);
  assert.match(html, /grid gap-3 lg:grid-cols-3/);
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

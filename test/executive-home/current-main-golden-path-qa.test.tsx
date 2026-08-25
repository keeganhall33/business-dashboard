import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";

import FinancialSpecialistPage from "@/app/(app)/specialists/financial/page";
import GoalsCapacitySpecialistPage from "@/app/(app)/specialists/goals-capacity/page";
import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { stateTone } from "@/components/executive-home/IntelligencePrimitives";
import { DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import { EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1 } from "@/lib/executive-home/decision-room-drilldown";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import { getSpecialistCommandCenterCardsV1 } from "@/lib/executive-home/specialist-command-center";

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

test("current-main executive golden path renders command center specialist summaries recommendation and Decision Room evidence", () => {
  const homeHtml = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  const financialHtml = renderToString(<FinancialSpecialistPage />);
  const goalsHtml = renderToString(<GoalsCapacitySpecialistPage />);
  const specialistCards = getSpecialistCommandCenterCardsV1();

  assert.match(homeHtml, /Executive command center/);
  assert.match(homeHtml, /Specialist intelligence/);
  assert.deepEqual(specialistCards.map((card) => card.id), ["financial", "goals-capacity", "relationships"]);
  assert.match(financialHtml, /Financial intelligence/);
  assert.match(financialHtml, /Command-center summary/);
  assert.match(goalsHtml, /Goals \/ Capacity/);
  assert.match(goalsHtml, /Capacity conflicts remain visible/);
  assert.match(homeHtml, /Protect premium scarcity while choosing the next move/);
  assert.match(homeHtml, /Open Decision Room/);
  assert.match(homeHtml, /Grounded drill-down/);
  assert.match(homeHtml, /No Decision Room is open/);
});

test("current-main recommendation opens Decision Room with evidence unknowns conflicts and next action intact", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  });

  const openButton = renderer!.root.findAllByType("button").find((button) => button.children.includes("Open Decision Room"));
  assert.ok(openButton, "expected recommendation Decision Room opener");

  act(() => {
    openButton.props.onClick();
  });

  const html = renderedText(renderer!);

  assert.match(html, /Private collector room access validation/);
  assert.match(html, /Evidence fixture: attribution conflict remains visible/);
  assert.match(html, /Financial fixture: weak direct economics/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /Assumptions \/ unknowns/);
  assert.match(html, /Direct event economics/);
  assert.match(html, /Next high-leverage move/);
  assert.match(html, /Run the smallest access validation/);
  assert.match(html, /L1_RECOMMENDATION/);
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.decision_id, DECISION_ROOM_FIXTURE_V1.decision_id);
});

test("current-main truth-state acceptance preserves UNKNOWN STALE and CONFLICTED without fake-zero coercion", () => {
  const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  const evidenceStates = new Set(DECISION_ROOM_FIXTURE_V1.evidence_refs.map((ref) => ref.truth_state));
  const commandCenterStates = [
    ...EXECUTIVE_HOME_FIXTURE_V1.command_center.kpis.map((item) => item.truth_state),
    ...EXECUTIVE_HOME_FIXTURE_V1.command_center.what_changed.map((item) => item.truth_state),
    ...EXECUTIVE_HOME_FIXTURE_V1.command_center.system_glance.map((item) => item.truth_state)
  ];

  assert.ok(evidenceStates.has("UNKNOWN"));
  assert.ok(evidenceStates.has("CONFLICTED"));
  assert.ok(commandCenterStates.includes("UNKNOWN"));
  assert.equal(stateTone("UNKNOWN"), "amber");
  assert.equal(stateTone("STALE"), "amber");
  assert.equal(stateTone("CONFLICTED"), "rose");
  assert.match(html, /UNKNOWN economics/);
  assert.match(html, /Do not treat UNKNOWN economics as zero/);
  assert.doesNotMatch(html, /UNKNOWN[^<]{0,40}(?:\$0|0%|false|none proven)/i);
});

test("current-main executive shell remains light-mode-only and mobile usable", () => {
  const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);

  assert.match(html, /bg-\[#f8f4ec\]/);
  assert.match(html, /text-stone-950/);
  assert.match(html, /flex w-full max-w-full flex-wrap gap-2/);
  assert.match(html, /grid gap-3 md:grid-cols-3 xl:grid-cols-6/);
  assert.match(html, /grid gap-3 lg:grid-cols-3/);
  assert.match(html, /sm:px-6 lg:px-8/);
  assert.doesNotMatch(html, /bg-zinc-950|bg-slate-950|text-zinc-100|text-white\/80/);
});

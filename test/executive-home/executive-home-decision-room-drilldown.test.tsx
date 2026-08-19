import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1 } from "@/lib/executive-home/decision-room-drilldown";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

test("Executive Home visibly links one recommendation to its Decision Room drill-down", () => {
  const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);

  assert.match(html, /Protect premium scarcity while choosing the next move/);
  assert.match(html, /Open Decision Room/);
  assert.match(html, /href="#decision-private-collector-room"/);
  assert.match(html, /Grounded drill-down/);
  assert.match(html, /No Decision Room is open/);
  assert.match(html, /Choose recommendation above/);
});

test("Home recommendation opens Decision Room with grounded why evidence unknowns counterargument and next move", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  });

  const root = renderer!.root;
  const openButton = root.findAllByType("button").find((button) => button.children.includes("Open Decision Room"));
  assert.ok(openButton, "expected Open Decision Room button");

  act(() => {
    openButton.props.onClick();
  });

  const html = renderedText(renderer!);

  assert.match(html, /Decision Room/);
  assert.match(html, /Private collector room access validation/);
  assert.match(html, /Evidence fixture: attribution conflict remains visible/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /Strongest argument against/);
  assert.match(html, /no verified buyer/);
  assert.match(html, /Next high-leverage move/);
  assert.match(html, /Run the smallest access validation/);
  assert.match(html, /Back to Executive Home/);
});

test("grounded drill-down anchor also opens the Decision Room before navigation", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  });

  const root = renderer!.root;
  const jumpLink = root.findAllByType("a").find((link) => link.children.includes("Jump to grounded drill-down"));
  assert.ok(jumpLink, "expected grounded drill-down jump link");
  assert.equal(jumpLink.props.href, "#decision-private-collector-room");

  act(() => {
    jumpLink.props.onClick();
  });

  assert.match(renderedText(renderer!), /Private collector room access validation/);
});

test("contextual Ask Jeeves grounded follow-up answer survives the same Home to Decision Room flow", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  });

  const openButton = renderer!.root.findAllByType("button").find((button) => button.children.includes("Open Decision Room"));
  assert.ok(openButton);

  act(() => {
    openButton.props.onClick();
  });

  const html = renderedText(renderer!);

  assert.match(html, /Contextual Ask Jeeves/);
  assert.match(html, /Ask why this recommendation is grounded/);
  assert.match(html, /turn-grounded-why/);
  assert.match(html, /Prestige fit is strong/);
  assert.match(html, /access and direct economics are still unknown/);
  assert.match(html, /Voice and text share the same canonical pipeline/);
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.contextual_ask.memory_write_policy, "NO_WRITE_WITHOUT_CLASSIFICATION");
});

test("fixture seam preserves existing DecisionRoomV1 and conversational-decision ids", () => {
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.contract_version, "decision_room_view_model_v1");
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.source_card_id, "matters-now-premium-scarcity");
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.decision_id, "decision-private-collector-room");
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.contextual_ask.scope, "DECISION_CONTEXT");
  assert.equal(EXECUTIVE_HOME_DECISION_ROOM_DRILLDOWN_FIXTURE_V1.contextual_ask.transcript, "turn-grounded-why");
});

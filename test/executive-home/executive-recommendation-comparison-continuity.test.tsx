import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

function renderedTree(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function renderOpenedDecisionRoom(): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);
  });

  const openButton = renderer!.root.findAllByType("button").find((button) => button.children.includes("Open Decision Room"));
  assert.ok(openButton, "expected Executive Home recommendation to open Decision Room");

  act(() => {
    openButton.props.onClick();
  });

  return renderer!;
}

test("executive recommendation comparison continuity preserves option evidence confidence and next action through navigation", () => {
  const renderer = renderOpenedDecisionRoom();
  const html = renderedTree(renderer);

  assert.match(html, /Recommendation comparison continuity/);
  assert.match(html, /Comparison continuity/);
  assert.match(html, /Private collector room access validation/);
  assert.match(html, /Build the full private collector room concept now/);
  assert.match(html, /Ignore the event path and keep studio focus only/);
  assert.match(html, /Confidence/);
  assert.match(html, /likely/);
  assert.match(html, /L1_RECOMMENDATION/);
  assert.match(html, /Run the smallest access validation/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /Source drill-down remains in Decision Room/);

  const options = renderer.root.findAllByProps({ "data-testid": "executive-comparison-continuity-option" });
  assert.equal(options.length, 2);
});

test("executive recommendation comparison continuity remains compact mobile and light-mode friendly", () => {
  const renderer = renderOpenedDecisionRoom();
  const html = renderedTree(renderer);

  assert.match(html, /bg-\[#fffdf8\]/);
  assert.match(html, /grid gap-2 sm:grid-cols-2/);
  assert.match(html, /md:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,0\.9fr\)\]/);
  assert.match(html, /flex flex-wrap gap-2/);
  assert.doesNotMatch(html, /bg-zinc-950|bg-slate-950|text-zinc-100|text-white\/80/);
  assert.doesNotMatch(html, /UNKNOWN[^"]{0,80}(?:\$0|0%|false|none proven)/i);
});

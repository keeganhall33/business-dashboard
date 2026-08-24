import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";

import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { advanceExecutiveStrategyStepV1, EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function nodeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const children = (value as { children?: unknown[] }).children;
  if (Array.isArray(value)) return value.map(nodeText).join(" ");
  if (Array.isArray(children)) return children.map(nodeText).join(" ");
  return "";
}

test("dashboard command center uses a full-width light shell without dark gutters", () => {
  const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);

  assert.match(html, /Executive command center/);
  assert.match(html, /max-w-\[1600px\]/);
  assert.match(html, /bg-\[#f8f4ec\]/);
  assert.match(html, /What changed/);
  assert.match(html, /Strategy and next steps/);
  assert.match(html, /Do now/);
  assert.match(html, /Keegan action required/);
  assert.match(html, /Top opportunities/);
  assert.match(html, /System at a glance/);
  assert.match(html, /Intelligence engine/);
  assert.doesNotMatch(html, /bg-black|bg-zinc-950|bg-slate-950|min-h-screen bg-\[#f7f2ea\] py-6/);
});

test("command center preserves UNKNOWN instead of converting missing evidence to zero or false", () => {
  const html = renderToString(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);

  assert.match(html, /UNKNOWN economics/);
  assert.match(html, /Direct economics for prestige event concepts remain UNKNOWN rather than zero/);
  assert.match(html, /UNKNOWN/);
  assert.doesNotMatch(html, />0<\/div><div[^>]*>Data health/);
  assert.doesNotMatch(html, /false/);
});

test("command center cards expose drill-down controls for metrics and actions", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);
  });

  const automationButton = renderer!.root.findAllByType("button").find((button) => nodeText(button.children).includes("Automation health"));
  assert.ok(automationButton, "expected Automation health metric button");

  act(() => {
    automationButton.props.onClick();
  });

  const html = renderedText(renderer!);
  assert.match(html, /Drill-down/);
  assert.match(html, /Source \/ provenance/);
  assert.match(html, /Truth state/);
  assert.match(html, /Why it matters/);
  assert.match(html, /Unknowns \/ conflicts/);
});

test("strategy step completion is explicit and preserves auditable history", () => {
  const next = advanceExecutiveStrategyStepV1(
    EXECUTIVE_HOME_FIXTURE_V1.command_center,
    "step-access-check",
    "2026-08-23T12:00:00.000Z",
    "KEEGAN"
  );

  const completed = next.strategy_path.steps.find((step) => step.id === "step-access-check");
  const verification = next.strategy_path.steps.find((step) => step.id === "step-room-fit");

  assert.equal(completed?.state, "COMPLETED");
  assert.equal(completed?.completed_at, "2026-08-23T12:00:00.000Z");
  assert.equal(verification?.state, "NEEDS_VERIFICATION");
  assert.equal(next.strategy_path.history.length, 1);
  assert.equal(next.strategy_path.history[0].actor, "KEEGAN");
  assert.equal(next.strategy_path.history[0].provenance, "EXPLICIT_USER_COMPLETION");
  assert.match(next.strategy_path.history[0].note, /needs verification/);
});

test("completion button advances the visible sequence and reveals verification state", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);
  });

  const completeButton = renderer!.root.findAllByType("button").find((button) => nodeText(button.children).includes("Mark current step complete"));
  assert.ok(completeButton, "expected completion button");

  act(() => {
    completeButton.props.onClick();
  });

  const html = renderedText(renderer!);
  assert.match(html, /COMPLETED/);
  assert.match(html, /NEEDS_VERIFICATION/);
  assert.match(html, /2026-08-23T12:00:00.000Z/);
  assert.match(html, /EXPLICIT_USER_COMPLETION/);
});

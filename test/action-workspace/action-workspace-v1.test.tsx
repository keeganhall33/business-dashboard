import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";
import TestRenderer, { act } from "react-test-renderer";

import ActionWorkspacePage from "@/app/(app)/action-workspace/page";
import { ActionWorkspacePanel } from "@/components/action-workspace/ActionWorkspacePanel";
import { ExecutiveCommandCenter } from "@/components/executive-home/ExecutiveCommandCenter";
import { ACTION_WORKSPACE_FIXTURE_V1, ACTION_WORKSPACE_UNKNOWN_FIXTURE_V1 } from "@/lib/action-workspace/fixtures";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

test("one command-center recommendation links to the approval-ready action workspace", () => {
  const html = renderToString(<ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />);

  assert.match(html, /Open Action Workspace/);
  assert.match(html, /href="\/action-workspace"/);
});

test("action workspace route renders all required decision context in light mode", () => {
  const html = renderToString(<ActionWorkspacePage />);

  for (const label of [
    "OBJECTIVE",
    "WHY_NOW",
    "EXPECTED_UPSIDE",
    "RISK",
    "NEXT_ACTION",
    "SUCCESS_METRIC",
    "EVIDENCE",
    "CONFIDENCE / UNKNOWN",
    "OWNER",
    "APPROVAL_CLASS",
    "EVALUATION_DATE",
    "DEPENDENCIES"
  ]) {
    assert.match(html, new RegExp(label.replace("/", "\\/")));
  }

  assert.match(html, /Approval-ready action workspace/);
  assert.match(html, /bg-\[#f8f4ec\]/);
  assert.match(html, /lg:grid-cols-3/);
  assert.doesNotMatch(html, /bg-black|bg-zinc-950|bg-slate-950/);
});

test("demo approval controls are non-mutating fixture interactions", () => {
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<ActionWorkspacePanel workspace={ACTION_WORKSPACE_FIXTURE_V1} />);
  });

  assert.match(renderedText(renderer!), /Ready for review/);

  const approve = renderer!.root.findAllByType("button").find((button) => JSON.stringify(button.children).includes("Approve"));
  const reject = renderer!.root.findAllByType("button").find((button) => JSON.stringify(button.children).includes("Reject"));
  const defer = renderer!.root.findAllByType("button").find((button) => JSON.stringify(button.children).includes("Defer"));
  assert.ok(approve);
  assert.ok(reject);
  assert.ok(defer);

  act(() => approve.props.onClick());
  assert.match(renderedText(renderer!), /Approve previewed/);
  act(() => reject.props.onClick());
  assert.match(renderedText(renderer!), /Reject previewed/);
  act(() => defer.props.onClick());
  assert.match(renderedText(renderer!), /Defer previewed/);
  assert.match(renderedText(renderer!), /Fixture-only interaction/);
});

test("UNKNOWN remains explicit in action workspace context", () => {
  const html = renderToString(<ActionWorkspacePanel workspace={ACTION_WORKSPACE_UNKNOWN_FIXTURE_V1} />);

  assert.match(html, /UNKNOWN/);
  assert.match(html, /Purchase attribution remains UNKNOWN/);
  assert.match(html, /UNKNOWN remains explicit/);
  assert.doesNotMatch(html, />false</);
});

test("fixture adapter keeps Keegan action gated off and controls demo-only", () => {
  assert.equal(ACTION_WORKSPACE_FIXTURE_V1.keegan_action_required, "NO");
  assert.equal(ACTION_WORKSPACE_FIXTURE_V1.demo_controls.non_mutating, true);
  assert.deepEqual(ACTION_WORKSPACE_FIXTURE_V1.demo_controls.states, ["READY_FOR_REVIEW", "APPROVE_DEMO", "REJECT_DEMO", "DEFER_DEMO"]);
});

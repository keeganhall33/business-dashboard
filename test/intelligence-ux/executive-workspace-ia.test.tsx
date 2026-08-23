import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import {
  EXECUTIVE_ENTITY_ROUTES_V1,
  EXECUTIVE_FEEDBACK_ACTIONS_V1,
  EXECUTIVE_WORKSPACE_NAV_V1,
  getExecutiveWorkspaceByHrefV1
} from "@/lib/executive-workspace/ia";

test("executive workspace IA gives every major domain a navigable home", () => {
  const hrefs = EXECUTIVE_WORKSPACE_NAV_V1.map((item) => item.href);

  assert.deepEqual(hrefs, [
    "/dashboard",
    "/strategy",
    "/opportunities-actions",
    "/relationships",
    "/events-market-windows",
    "/specialists",
    "/learning",
    "/data-evidence",
    "/ask-jeeves"
  ]);
  assert.ok(EXECUTIVE_WORKSPACE_NAV_V1.every((item) => item.summary.length > 20));
  assert.ok(EXECUTIVE_WORKSPACE_NAV_V1.every((item) => item.owns.length > 0));
});

test("workspace pages preserve evidence policy and do not create duplicate truth stores", () => {
  const model = getExecutiveWorkspaceByHrefV1("/data-evidence");
  const html = renderToString(<ExecutiveWorkspacePage model={model} />);

  assert.equal(model.contract_version, "executive_workspace_ia_v1");
  assert.equal(model.evidence_policy.hides_low_level_ingestion_noise, true);
  assert.equal(model.evidence_policy.unknown_stale_conflicted_remain_explicit, true);
  assert.equal(model.evidence_policy.no_duplicate_truth_store, true);
  assert.equal(model.evidence_policy.canonical_state_updates_preserve_history, true);
  assert.match(html, /Data &amp; Evidence/);
  assert.match(html, /UNKNOWN, STALE, and CONFLICTED stay visible/);
  assert.match(html, /No duplicate truth store/);
  assert.doesNotMatch(html, /UNKNOWN[^<]*0|false/);
});

test("entity-first drill-down routes cover important objects without modal-only dead ends", () => {
  const kinds = EXECUTIVE_ENTITY_ROUTES_V1.map((route) => route.kind);

  assert.deepEqual(kinds, [
    "person",
    "organization",
    "opportunity",
    "event",
    "project",
    "decision",
    "action",
    "metric",
    "artwork",
    "experiment",
    "relationship",
    "source-evidence"
  ]);
  assert.ok(EXECUTIVE_ENTITY_ROUTES_V1.every((route) => route.href_pattern.includes("[id]")));
});

test("feedback standard is consistent across workspaces and includes audit-safe state changes", () => {
  assert.deepEqual(EXECUTIVE_FEEDBACK_ACTIONS_V1, [
    "COMPLETE",
    "IN_PROGRESS",
    "WAITING",
    "BLOCKED",
    "NEEDS_VERIFICATION",
    "APPROVE",
    "REJECT",
    "DEFER",
    "NOT_INTERESTED",
    "CONTACTED",
    "RESPONSE_RECEIVED",
    "MEETING_HELD",
    "CORRECT",
    "INCORRECT",
    "ADD_CONTEXT"
  ]);

  const strategy = getExecutiveWorkspaceByHrefV1("/strategy");
  const actions = getExecutiveWorkspaceByHrefV1("/opportunities-actions");

  assert.deepEqual(strategy.feedback_actions, actions.feedback_actions);
  assert.match(renderToString(<ExecutiveWorkspacePage model={actions} />), /actor, timestamp, provenance, reason note, and history/);
});

test("Executive Home links to owning workspaces instead of becoming one long subsystem page", () => {
  const html = renderToString(<ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />);

  assert.match(html, /Owning workspaces/);
  assert.match(html, /href="\/strategy"/);
  assert.match(html, /href="\/opportunities-actions"/);
  assert.match(html, /href="\/relationships"/);
  assert.match(html, /href="\/events-market-windows"/);
  assert.match(html, /href="\/specialists"/);
  assert.match(html, /href="\/learning"/);
  assert.match(html, /href="\/data-evidence"/);
  assert.match(html, /href="\/ask-jeeves"/);
  assert.match(html, /Executive Home stays concise/);
});

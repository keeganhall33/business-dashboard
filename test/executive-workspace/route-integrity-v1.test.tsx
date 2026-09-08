import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import {
  EXECUTIVE_WORKSPACE_NAV_V1,
  getExecutiveWorkspaceByHrefV1
} from "@/lib/executive-workspace/ia";
import { resolveExecutiveWorkspaceDetailHrefV1 } from "@/lib/executive-workspace/route-integrity-v1";

function escapeHrefForMarkup(href: string): string {
  return href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

test("every current executive workspace detail CTA resolves to a real route or renders unavailable", () => {
  let routable = 0;
  let unavailable = 0;

  for (const nav of EXECUTIVE_WORKSPACE_NAV_V1) {
    const model = getExecutiveWorkspaceByHrefV1(nav.href);
    const html = renderToStaticMarkup(<ExecutiveWorkspacePage model={model} />);

    for (const section of model.sections) {
      for (const card of section.cards) {
        const resolution = resolveExecutiveWorkspaceDetailHrefV1(card.detail_href);
        if (resolution.state === "ROUTABLE") {
          routable += 1;
          assert.match(html, new RegExp(`href=\\"${escapeHrefForMarkup(card.detail_href).replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\"`));
        } else {
          unavailable += 1;
          assert.ok(!html.includes(`href=\"${escapeHrefForMarkup(card.detail_href)}\"`), card.detail_href);
        }
      }
    }
  }

  assert.ok(routable > 0);
  assert.ok(unavailable > 0);
});

test("known missing dynamic destinations cannot masquerade as working controls", () => {
  for (const href of [
    "/opportunities-actions/opportunity/elite-network-optionality",
    "/relationships/person/priority-introducer",
    "/events-market-windows/event/prestige-window",
    "/strategy/decision/premium-collector-room",
    "/learning/experiment/collector-room-validation",
    "/data-evidence/source/direct-economics"
  ]) {
    assert.deepEqual(resolveExecutiveWorkspaceDetailHrefV1(href), {
      state: "UNAVAILABLE",
      reason: "NOT_IMPLEMENTED"
    });
  }
});

test("implemented workspace, query, hash, and verified specialist destinations remain routable", () => {
  for (const href of [
    "/dashboard#WHAT_MATTERS_NOW",
    "/opportunities-actions?actionView=needs-me",
    "/ask-jeeves?q=why-this",
    "/creative-direction",
    "/specialists/financial"
  ]) {
    assert.deepEqual(resolveExecutiveWorkspaceDetailHrefV1(href), { state: "ROUTABLE", href });
  }
});

test("external, malformed, traversal, and unimplemented destinations fail closed", () => {
  for (const href of [
    "https://example.com/dashboard",
    "//example.com/dashboard",
    "javascript:alert(1)",
    "/strategy/../dashboard",
    "/strategy/%2e%2e/dashboard",
    "/strategy\\..\\dashboard",
    "/not-an-implemented-route",
    " /dashboard",
    ""
  ]) {
    assert.equal(resolveExecutiveWorkspaceDetailHrefV1(href).state, "UNAVAILABLE", href);
  }
});

test("user-facing workspaces no longer expose the developer entity-route inventory", () => {
  const model = getExecutiveWorkspaceByHrefV1("/strategy");
  const html = renderToStaticMarkup(<ExecutiveWorkspacePage model={model} />);

  assert.ok(!html.includes("Entity deep links"));
  assert.ok(!html.includes("/relationships/person/[id]"));
  assert.ok(html.includes("Detail unavailable"));
});

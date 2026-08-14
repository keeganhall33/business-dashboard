import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExecutiveSummaryPanel } from "../../src/components/dashboard/ExecutiveSummaryPanel";

test("ExecutiveSummaryPanel renders website intelligence read-only inline section", () => {
  const summary = {
    generatedAt: "2026-08-13T00:00:00.000Z",
    actions: [],
    wins: [],
    risks: [],
    blockedItems: [],
    decisionsNeeded: []
  } as any;

  const html = renderToStaticMarkup(<ExecutiveSummaryPanel summary={summary} />);
  assert.match(html, /Website intelligence \(read-only\)/);
  assert.match(html, /READ_ONLY/);
  assert.match(html, /MUTATION_DISABLED/);
  assert.match(html, /Unknown/);
});


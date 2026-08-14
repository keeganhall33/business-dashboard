import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteIntelligenceSummaryPanel } from "../../src/components/dashboard/WebsiteIntelligenceSummaryPanel";
import { WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1 } from "../../src/lib/dashboard/website-intelligence-summary-fixture";
import { ExecutiveSummaryPanel } from "../../src/components/dashboard/ExecutiveSummaryPanel";

test("WebsiteIntelligenceSummaryPanel has deterministic anchor id", () => {
  const html = renderToStaticMarkup(<WebsiteIntelligenceSummaryPanel snapshot={WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1} />);
  assert.match(html, /id=\"website-intelligence\"/);
});

test("ExecutiveSummaryPanel includes in-page hash link to website intelligence anchor", () => {
  const summary = {
    generatedAt: "2026-08-13T00:00:00.000Z",
    actions: [],
    wins: [],
    risks: [],
    blockedItems: [],
    decisionsNeeded: []
  } as any;

  const html = renderToStaticMarkup(<ExecutiveSummaryPanel summary={summary} />);
  assert.match(html, /href=\"#website-intelligence\"/);
});


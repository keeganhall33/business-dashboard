import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebsiteIntelligenceSummaryPanel } from "../../src/components/dashboard/WebsiteIntelligenceSummaryPanel";
import { WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1 } from "../../src/lib/dashboard/website-intelligence-summary-fixture";

test("WebsiteIntelligenceSummaryPanel renders READ_ONLY + MUTATION_DISABLED and preserves UNKNOWN when fields missing", () => {
  const html = renderToStaticMarkup(<WebsiteIntelligenceSummaryPanel snapshot={WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1} />);
  assert.match(html, /READ_ONLY/);
  assert.match(html, /MUTATION_DISABLED/);
  assert.match(html, />Unknown</);
  assert.match(html, /Top opportunities/);
});

test("WebsiteIntelligenceSummaryPanel renders Unknown for null numeric fields (no fabricated zeros)", () => {
  const html = renderToStaticMarkup(
    <WebsiteIntelligenceSummaryPanel
      snapshot={{
        ...WEBSITE_INTELLIGENCE_SUMMARY_FIXTURE_V1,
        pageCount: null,
        brokenLinkCount: null,
        missingAltCount: null
      }}
    />
  );
  // three metrics should show Unknown.
  const matches = html.match(/>Unknown</g) ?? [];
  assert.ok(matches.length >= 3);
});


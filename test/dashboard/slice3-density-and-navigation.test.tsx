import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutiveNav } from "@/components/dashboard/ExecutiveNav";
import { DataConfidencePanel } from "@/components/dashboard/DataConfidencePanel";
import { DataLimitationsBanner } from "@/components/dashboard/DataLimitationsBanner";
import { ExecutiveRangeHeader } from "@/components/dashboard/ExecutiveRangeHeader";

import type { ConfidenceSummary } from "@/lib/data-confidence";

test("navigation targets valid section ids and excludes hidden experimental", () => {
  const html = renderToStaticMarkup(
    React.createElement(ExecutiveNav, {
      items: [
        { id: "executive", label: "Executive" },
        { id: "commerce", label: "Commerce" },
        { id: "marketing", label: "Marketing" },
        { id: "confidence", label: "Confidence" },
        { id: "diagnostics", label: "Diagnostics" }
        // Experimental intentionally omitted
      ]
    })
  );

  assert.match(html, /href="#executive"/);
  assert.match(html, /href="#commerce"/);
  assert.match(html, /href="#marketing"/);
  assert.match(html, /href="#confidence"/);
  assert.match(html, /href="#diagnostics"/);
  assert.ok(!/experimental/i.test(html));
});

test("Data Confidence compact summary renders counts and retains details", () => {
  const summary: ConfidenceSummary = {
    entries: [],
    partialDay: false,
    overall: { label: "Low confidence", tone: "rose", rationale: "Key sources unavailable", state: "unavailable", lastRefresh: null },
    trustedSources: ["Woo"],
    caveatSources: [],
    insufficientSources: ["GA4", "Meta"],
    conflictingSources: [],
    topRisk: {
      id: "ga4",
      label: "GA4",
      state: "unavailable",
      freshnessHours: null,
      coverage: "",
      completeness: "",
      provenance: "",
      lastSuccess: null,
      lastVerified: null,
      warningCodes: [],
      confidenceScore: 0,
      executiveImpact: "",
      decisionImpact: "GA4 is unavailable.",
      recommendedAction: "Restore GA4 ingestion"
    },
    decisionsAffected: [],
    recommendedActions: []
  };

  const html = renderToStaticMarkup(React.createElement(DataConfidencePanel, { summary }));
  assert.match(html, /Trusted 1/);
  assert.match(html, /Unavailable 2/);
  assert.match(html, /Highest-priority issue/);
  assert.match(html, /Next: Restore GA4 ingestion/);
  // Details are still available with one interaction.
  assert.match(html, /Show full confidence breakdown/);
});

test("Data limitations banner renders only in degraded mode", () => {
  const degraded = {
    degraded: {
      active: true,
      reason: "Limited reporting",
      unavailableDomains: [{ domainId: "woo", label: "Woo", coverage: "unavailable", freshness: "unavailable", confidence: "unavailable", consequence: { summary: "", decisionsAffected: [] } }],
      stillWorks: [],
      consequence: { summary: "Revenue decisions cannot be verified.", decisionsAffected: [] },
      nextAction: { title: "Restore GA4 ingestion", href: "/data", detail: "Restores session and conversion verification." }
    },
    domains: {},
    metrics: {}
  };

  const html = renderToStaticMarkup(React.createElement(DataLimitationsBanner, { truth: degraded }));
  assert.match(html, /Data Limitations/);
  assert.match(html, /Restore GA4 ingestion/);
  assert.match(html, /Restores session and conversion verification\./);
  // Exactly one CTA link to /data.
  assert.equal((html.match(/href="\/data"/g) ?? []).length, 1);

  const healthy = { ...degraded, degraded: { ...degraded.degraded, active: false } };
  const html2 = renderToStaticMarkup(React.createElement(DataLimitationsBanner, { truth: healthy }));
  assert.equal(html2, "");
});

test("header limited-reporting indicator aligns with degraded flag", () => {
  const range = { preset: "month_to_date", startDate: "2026-08-01", endDate: "2026-08-02" } as const;

  const degradedHtml = renderToStaticMarkup(
    React.createElement(ExecutiveRangeHeader, { range, degraded: true, showControls: false })
  );
  assert.match(degradedHtml, /LIMITED REPORTING/);

  const healthyHtml = renderToStaticMarkup(
    React.createElement(ExecutiveRangeHeader, { range, degraded: false, showControls: false })
  );
  assert.ok(!/LIMITED REPORTING/.test(healthyHtml));
});

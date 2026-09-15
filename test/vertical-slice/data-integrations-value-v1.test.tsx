import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataIntegrationsVerticalSlice } from "../../src/components/vertical-slice/DataIntegrationsVerticalSlice";
import type { DashboardOverviewResponse } from "../../src/lib/types/dashboard";

test("data status shows decision-ready source health without internal inventory clutter", () => {
    const data = {
      timestamp: "2026-09-15T12:00:00Z",
      range: { startDate: "2026-08-16", endDate: "2026-09-14" },
      websiteConversion: null,
      commerceTelemetry: null,
      metaAds: null,
      industryPulseSnapshot: null,
      schedulerSummary: null,
      schedulerJobs: [],
      pipelinePanel: null,
      collectorTelemetry: null
    } as unknown as DashboardOverviewResponse;

    const html = renderToStaticMarkup(<DataIntegrationsVerticalSlice data={data} />);

  assert.match(html, /Current data confidence/);
  assert.match(html, /Fix next/);
  assert.match(html, /Business sources/);
  assert.match(html, /Important gaps/);
  assert.match(html, /Email performance/);
  assert.doesNotMatch(html, /Integration inventory/);
  assert.doesNotMatch(html, /Milestone 7/);
  assert.doesNotMatch(html, /Source id:/);
  assert.doesNotMatch(html, /technically connectable/);
});

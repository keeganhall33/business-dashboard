/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MarketingPerformancePanel } from "../src/components/dashboard/MarketingPerformancePanel";

test("Marketing panel renders Unavailable for missing GA4 revenue and avg engagement", () => {
  const html = renderToStaticMarkup(
    <MarketingPerformancePanel
      telemetry={{
        range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" },
        ga4: {
          summary: {
            sessions: 100,
            engagedSessions: 50,
            revenue: null,
            eventCount: 12,
            avgEngagementSeconds: null
          },
          timeseries: []
        }
      } as any}
    />
  );

  assert.match(html, />GA4 revenue<\/div>[\s\S]*>Unavailable<\/div>/);
  assert.match(html, />Avg engagement<\/div>[\s\S]*>Unavailable<\/div>/);
});

test("Marketing panel avoids fake trend bars when series lacks enough numeric history", () => {
  const html = renderToStaticMarkup(
    <MarketingPerformancePanel
      telemetry={{
        range: { preset: "7d", startDate: "2026-07-01", endDate: "2026-07-07" },
        ga4: {
          summary: { sessions: 100, engagedSessions: 50, revenue: 10, eventCount: 12, avgEngagementSeconds: 30 },
          timeseries: [{ sessions: null, engagedSessions: null, revenue: null }]
        }
      } as any}
    />
  );

  // The KPI helper renders a small progress bar only when series.length >= 2.
  assert.doesNotMatch(html, /h-1 w-\[55%\]/);
});

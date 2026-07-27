/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandPowerPanel } from "../src/components/dashboard/BrandPowerPanel";

test("Experimental panel shows compact empty state and hides wins/actions when no provenanced metric exists", () => {
  const html = renderToStaticMarkup(
    <BrandPowerPanel
      data={{
        metrics: [{ metricKey: "engagement", currentValue: 0.56, targetValue: null, unit: "percent" }],
        whatIsWorking: ["Should not render"],
        whatToDoNext: ["Should not render"],
        targets: []
      } as any}
    />
  );

  assert.match(html, /No experimental metrics/);
  assert.doesNotMatch(html, /Whats Working/);
  assert.doesNotMatch(html, /What to Do Next/);
});

test("Experimental panel renders a provenanced metric with required fields", () => {
  const html = renderToStaticMarkup(
    <BrandPowerPanel
      data={{
        metrics: [
          {
            metricKey: "cultural_relevance",
            currentValue: 0.56,
            targetValue: null,
            unit: "percent",
            source: "Supabase",
            formula: "mentions / followers",
            measuredAt: "2026-07-07"
          }
        ],
        whatIsWorking: ["Hidden"],
        whatToDoNext: ["Hidden"],
        targets: []
      } as any}
    />
  );

  assert.match(html, /Experimental/);
  assert.match(html, /Source: Supabase/);
  assert.match(html, /Formula: mentions \/ followers/);
  assert.match(html, /Applies to: selected range/);
  assert.match(html, /Measured: 2026-07-07/);
});

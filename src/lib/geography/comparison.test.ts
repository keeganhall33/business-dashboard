import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesGeographyComparison } from "./comparison";
import type { SalesGeographySnapshot } from "@/lib/types/dashboard";

const baseRange = { preset: "7d", startDate: "2026-06-12", endDate: "2026-06-18" };
const prevRange = { preset: "7d", startDate: "2026-06-05", endDate: "2026-06-11" };

function buildSnapshot(overrides: Partial<SalesGeographySnapshot>): SalesGeographySnapshot {
  return {
    range: baseRange,
    locations: [],
    summary: {
      totalLocations: 0,
      topCountry: null,
      topRegion: null,
      topCity: null,
      domesticRevenue: 0,
      internationalRevenue: 0
    },
    generatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("detects new location", () => {
  const current = buildSnapshot({
    locations: [
      { id: "country:us", label: "United States", city: null, state: null, country: "United States", privacyLevel: "country", orderCount: 2, revenue: 200, units: 2, topProducts: [] }
    ]
  });
  const previous = buildSnapshot({ range: prevRange });
  const comparison = buildSalesGeographyComparison(current, previous);
  assert(comparison);
  assert.equal(comparison.newLocations.length, 1);
  assert.equal(comparison.newLocations[0].label, "United States");
});

test("detects rising location", () => {
  const current = buildSnapshot({
    locations: [
      { id: "country:us", label: "United States", city: null, state: null, country: "United States", privacyLevel: "country", orderCount: 3, revenue: 200, units: 3, topProducts: [] }
    ],
    summary: { totalLocations: 1, topCountry: null, topRegion: null, topCity: null, domesticRevenue: 200, internationalRevenue: 0 }
  });
  const previous = buildSnapshot({
    range: prevRange,
    locations: [
      { id: "country:us", label: "United States", city: null, state: null, country: "United States", privacyLevel: "country", orderCount: 1, revenue: 100, units: 1, topProducts: [] }
    ],
    summary: { totalLocations: 1, topCountry: null, topRegion: null, topCity: null, domesticRevenue: 100, internationalRevenue: 0 }
  });
  const comparison = buildSalesGeographyComparison(current, previous);
  assert(comparison);
  assert.equal(comparison.risingLocations.length, 1);
  assert.ok((comparison.domesticDelta ?? 0) > 0);
});

test("suppressed snapshots do not produce comparison", () => {
  const suppressed = buildSnapshot({
    suppressedReasons: ["No data"],
    locations: []
  });
  const comparison = buildSalesGeographyComparison(suppressed, suppressed);
  assert.equal(comparison, null);
});

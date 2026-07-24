import test from "node:test";
import assert from "node:assert/strict";
import { buildDisplayLocations } from "./display";

test("city-level entries keep city label", () => {
  const display = buildDisplayLocations([
    {
      id: "city:seattle",
      label: "Seattle, WA",
      city: "Seattle",
      state: "WA",
      country: "United States",
      privacyLevel: "city",
      orderCount: 4,
      revenue: 400,
      units: 4,
      topProducts: []
    }
  ]);
  assert.equal(display[0].primaryLabel, "Seattle, WA");
  assert.equal(display[0].secondaryLabel, "United States");
  assert.equal(display[0].topProduct, null);
});

test("country-level entries drop city/state", () => {
  const display = buildDisplayLocations([
    {
      id: "country:us",
      label: "US",
      city: "Franklin",
      state: "TN",
      country: "United States",
      privacyLevel: "country",
      orderCount: 2,
      revenue: 169.46,
      units: 2,
      topProducts: [{ name: "Ronald Acuna Jr", units: 1, revenue: 75 }]
    }
  ]);
  assert.equal(display[0].primaryLabel, "United States");
  assert.equal(display[0].secondaryLabel, null);
  assert.equal(display[0].topProduct, "Ronald Acuna Jr");
});

test("share percent handles zero totals", () => {
  const display = buildDisplayLocations([
    {
      id: "country:unknown",
      label: "Unknown",
      city: null,
      state: null,
      country: null,
      privacyLevel: "country",
      orderCount: 1,
      revenue: 0,
      units: 1,
      topProducts: []
    }
  ]);
  assert.equal(display[0].sharePercent, 0);
});

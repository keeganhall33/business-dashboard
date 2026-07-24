import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSalesGeography } from "./aggregateSalesGeography";
import type { SalesGeographyOrder } from "./aggregateSalesGeography";

const range = { preset: "7d", startDate: "2026-06-11", endDate: "2026-06-17" } as const;

function buildOrder(partial: SalesGeographyOrder): SalesGeographyOrder {
  return {
    total: 100,
    lineItems: [{ name: "Test", quantity: 1, total: 100 }],
    ...partial
  };
}

test("city level requires three orders before showing", () => {
  const orders: SalesGeographyOrder[] = [
    buildOrder({ shipping: { city: "Seattle", state: "WA", country: "United States" } }),
    buildOrder({ shipping: { city: "Seattle", state: "WA", country: "United States" } }),
    buildOrder({ shipping: { city: "Seattle", state: "WA", country: "United States" } }),
    buildOrder({ shipping: { city: "Los Angeles", state: "CA", country: "United States" } })
  ];
  const snapshot = aggregateSalesGeography(range, orders);
  const seattle = snapshot.locations.find((loc) => loc.label === "Seattle, WA");
  assert(seattle, "Expected Seattle bucket");
  assert.equal(seattle?.privacyLevel, "city");
  assert.equal(seattle?.orderCount, 3);
});

test("cities with fewer than three orders roll up to state when the state threshold is met", () => {
  const orders: SalesGeographyOrder[] = [
    buildOrder({ shipping: { city: "Portland", state: "OR", country: "United States" } }),
    buildOrder({ shipping: { city: "Portland", state: "OR", country: "United States" } }),
    buildOrder({ shipping: { city: "Eugene", state: "OR", country: "United States" } })
  ];
  const snapshot = aggregateSalesGeography(range, orders);
  const oregon = snapshot.locations.find((loc) => loc.label === "OR, United States");
  assert(oregon, "Expected OR state bucket");
  assert.equal(oregon?.privacyLevel, "state");
  assert.equal(oregon?.orderCount, 3);
  assert.equal(oregon?.city, null);
  assert.equal(oregon?.state, "OR");
});

test("missing locations roll into Unknown country bucket", () => {
  const orders: SalesGeographyOrder[] = [buildOrder({ shipping: null, billing: null })];
  const snapshot = aggregateSalesGeography(range, orders);
  const unknown = snapshot.locations.find((loc) => loc.label === "Unknown");
  assert(unknown, "Expected Unknown aggregation");
  assert.equal(unknown?.privacyLevel, "country");
});

test("low-volume city rolls up to country without exposing city/state", () => {
  const orders: SalesGeographyOrder[] = [
    buildOrder({ shipping: { city: "Franklin", state: "TN", country: "United States" } }),
    buildOrder({ shipping: { city: "Franklin", state: "TN", country: "United States" } })
  ];
  const snapshot = aggregateSalesGeography(range, orders);
  const country = snapshot.locations.find((loc) => loc.privacyLevel === "country");
  assert(country, "Expected country-level bucket");
  assert.equal(country?.city, null);
  assert.equal(country?.state, null);
  assert.equal(country?.label, "United States");
});

test("privacy notes are included", () => {
  const snapshot = aggregateSalesGeography(range, null);
  assert(snapshot.suppressedReasons?.length);
  assert(snapshot.privacyNotes?.length);
});

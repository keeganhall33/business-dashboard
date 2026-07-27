import test from "node:test";
import assert from "node:assert/strict";
import { resolveRange } from "../src/lib/date/resolve-range";

test("7D preset uses Pacific calendar day and includes today plus 6 prior days", () => {
  // Anchor at a fixed instant.
  const now = new Date("2026-07-27T12:00:00Z");
  const range = resolveRange("7d", null, null, now);
  assert.equal(range.preset, "7d");
  assert.equal(range.endDate, "2026-07-27");
  assert.equal(range.startDate, "2026-07-21");
});

test("Yesterday preset is previous Pacific calendar day", () => {
  const now = new Date("2026-07-27T12:00:00Z");
  const range = resolveRange("yesterday", null, null, now);
  assert.equal(range.startDate, "2026-07-26");
  assert.equal(range.endDate, "2026-07-26");
});

test("Previous month covers complete prior Pacific month", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const range = resolveRange("previous_month", null, null, now);
  assert.equal(range.startDate, "2026-06-01");
  assert.equal(range.endDate, "2026-06-30");
});

test("Custom range is inclusive and preserved when valid", () => {
  const now = new Date("2026-07-27T12:00:00Z");
  const range = resolveRange("custom", "2026-07-21", "2026-07-27", now);
  assert.equal(range.preset, "custom");
  assert.equal(range.startDate, "2026-07-21");
  assert.equal(range.endDate, "2026-07-27");
});

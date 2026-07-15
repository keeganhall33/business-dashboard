import test from "node:test";
import assert from "node:assert/strict";

import { getPreviousRange, countRangeDays, elapsedRangeDays, formatRangeLabel } from "../src/lib/date/range.ts";

const sampleRange = { startDate: "2026-07-01", endDate: "2026-07-15" };

test("getPreviousRange preserves window length", () => {
  const previous = getPreviousRange(sampleRange);
  assert.equal(previous.startDate, "2026-06-16");
  assert.equal(previous.endDate, "2026-06-30");
});

test("countRangeDays counts inclusive days", () => {
  assert.equal(countRangeDays(sampleRange), 15);
});

test("elapsedRangeDays clamps to today", () => {
  const today = new Date("2026-07-10T12:00:00Z");
  assert.equal(elapsedRangeDays(sampleRange, today), 10);
});

test("formatRangeLabel includes years when needed", () => {
  const label = formatRangeLabel({ startDate: "2025-12-28", endDate: "2026-01-02" }, { includeYear: true });
  assert.match(label, /Dec/);
  assert.match(label, /2026/);
});

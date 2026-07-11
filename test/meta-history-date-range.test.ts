import test from "node:test";
import assert from "node:assert/strict";

import { computeIngestionRange } from "../src/lib/meta-intel/date-range.ts";

function expectRange(referenceIso: string, expectedSince: string, expectedUntil: string) {
  const referenceDate = new Date(referenceIso);
  const range = computeIngestionRange({}, referenceDate);
  assert.equal(range.since, expectedSince);
  assert.equal(range.until, expectedUntil);
  assert.equal(range.days, 3);
}

test("latest three completed Pacific dates for July 11 PT", () => {
  expectRange("2026-07-11T19:00:00Z", "2026-07-08", "2026-07-10");
});

test("winter PST window respects calendar math", () => {
  expectRange("2026-01-15T18:00:00Z", "2026-01-12", "2026-01-14");
});

test("spring DST transition keeps calendar days", () => {
  expectRange("2026-03-09T20:00:00Z", "2026-03-06", "2026-03-08");
});

test("fall DST transition keeps calendar days", () => {
  expectRange("2026-11-03T18:00:00Z", "2026-10-31", "2026-11-02");
});

test("just before Pacific midnight still excludes current day", () => {
  expectRange("2026-07-12T06:59:00Z", "2026-07-08", "2026-07-10");
});

test("just after Pacific midnight still uses prior three completed days", () => {
  expectRange("2026-07-12T07:01:00Z", "2026-07-09", "2026-07-11");
});

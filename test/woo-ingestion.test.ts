import test from "node:test";
import assert from "node:assert/strict";
import { buildWooOrdersQuery, isOrderPaidInPacificRange, parsePacificDayFromIso, subtractDaysIso } from "@/lib/woo/woo-ingestion";

test("subtractDaysIso subtracts whole days", () => {
  assert.equal(subtractDaysIso("2026-07-29", 2), "2026-07-27");
});

test("buildWooOrdersQuery prefers modified_after and orders by modified", () => {
  const q = buildWooOrdersQuery({ page: 2, modifiedAfter: "2026-07-01T00:00:00Z", after: "x", before: null });
  assert.equal(q.modified_after, "2026-07-01T00:00:00Z");
  assert.equal(q.orderby, "modified");
  assert.equal(q.page, "2");
  assert.ok(!("after" in q));
});

test("buildWooOrdersQuery uses after/before (created-date) when modified_after absent", () => {
  const q = buildWooOrdersQuery({ page: 1, modifiedAfter: null, after: "2026-07-01T00:00:00Z", before: "2026-07-07T23:59:59Z" });
  assert.equal(q.after, "2026-07-01T00:00:00Z");
  assert.equal(q.before, "2026-07-07T23:59:59Z");
  assert.equal(q.orderby, "date");
});

test("parsePacificDayFromIso respects Pacific date boundary", () => {
  // 2026-07-01T06:59:59Z is 2026-06-30 23:59:59 in America/Los_Angeles (DST)
  assert.equal(parsePacificDayFromIso("2026-07-01T06:59:59Z"), "2026-06-30");
  // 2026-07-01T07:00:00Z is 2026-07-01 00:00:00 in America/Los_Angeles
  assert.equal(parsePacificDayFromIso("2026-07-01T07:00:00Z"), "2026-07-01");
});

test("isOrderPaidInPacificRange includes inclusive boundaries", () => {
  const order = { date_paid_gmt: "2026-07-01T07:00:00Z" };
  assert.equal(isOrderPaidInPacificRange(order, "2026-07-01", "2026-07-01"), true);
});

test("created before range, paid inside range is included by paid-date filter", () => {
  const order = { date_created_gmt: "2026-06-01T00:00:00Z", date_paid_gmt: "2026-07-03T12:00:00Z" };
  assert.equal(isOrderPaidInPacificRange(order, "2026-07-01", "2026-07-07"), true);
});

test("created inside range, paid after range is excluded", () => {
  // 2026-07-08T07:00:00Z is 2026-07-08 00:00:00 in America/Los_Angeles
  const order = { date_created_gmt: "2026-07-02T00:00:00Z", date_paid_gmt: "2026-07-08T07:00:00Z" };
  assert.equal(isOrderPaidInPacificRange(order, "2026-07-01", "2026-07-07"), false);
});

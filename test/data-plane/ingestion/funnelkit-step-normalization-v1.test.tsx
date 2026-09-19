import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeFunnelKitStepRecordsV1,
  normalizeFunnelKitWrittenRowCountV1
} from "../../../scripts/lib/funnelkit-step-normalization-v1.mjs";

const FUNNEL = { id: "1", title: "Store checkout" };
const VALID_RECORDS = [
  { object_id: "10", object_name: "Checkout", type: "checkout", views: "12", conversions: 7 },
  { object_id: 11, object_name: "", type: "thankyou", views: 7, conversions: "0" }
];

function normalize(overrides: Record<string, unknown> = {}) {
  return normalizeFunnelKitStepRecordsV1({
    records: VALID_RECORDS,
    funnelData: FUNNEL,
    requestedFunnelId: 1,
    ...overrides
  });
}

test("preserves validated live step counts, endpoint order, and real labels", () => {
  const result = normalize();

  assert.equal(result.activityEntries, 19);
  assert.equal(result.activityCompletions, 7);
  assert.deepEqual(result.rows.map((row: any) => ({
    id: row.step_id,
    name: row.step_name,
    index: row.step_index,
    entries: row.entries,
    completions: row.completions
  })), [
    { id: 10, name: "Checkout", index: 1, entries: 12, completions: 7 },
    { id: 11, name: "thankyou", index: 2, entries: 7, completions: 0 }
  ]);
  assert.ok(result.rows.every((row: any) => row.funnel_id === 1 && row.funnel_name === "Store checkout"));
});

test("uses the explicitly configured funnel id only when the payload omits its id", () => {
  const result = normalize({ funnelData: { title: "Store checkout" } });
  assert.ok(result.rows.every((row: any) => row.funnel_id === 1));
});

test("rejects missing or blank live counts instead of coercing them to zero", () => {
  for (const badValue of [undefined, null, "", "   "]) {
    assert.throws(() => normalize({ records: [{ ...VALID_RECORDS[0], views: badValue }] }), /views.*nonnegative safe integer/i);
    assert.throws(() => normalize({ records: [{ ...VALID_RECORDS[0], conversions: badValue }] }), /conversions.*nonnegative safe integer/i);
  }
});

test("rejects invalid counts instead of rounding or accepting impossible integer evidence", () => {
  for (const badValue of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, true]) {
    assert.throws(() => normalize({ records: [{ ...VALID_RECORDS[0], views: badValue }] }), /views.*nonnegative safe integer/i);
  }
});

test("rejects malformed step ids rather than silently dropping partial step evidence", () => {
  for (const badValue of [undefined, null, "", 0, -1, 1.5, Number.NaN]) {
    assert.throws(() => normalize({ records: [{ ...VALID_RECORDS[0], object_id: badValue }] }), /object_id.*positive safe integer/i);
  }
});

test("rejects duplicate step ids because the day cannot be normalized unambiguously", () => {
  assert.throws(() => normalize({
    records: [VALID_RECORDS[0], { ...VALID_RECORDS[1], object_id: "10" }]
  }), /duplicate step id 10/i);
});

test("requires an observed step label and never fabricates Step N", () => {
  assert.throws(() => normalize({
    records: [{ ...VALID_RECORDS[0], object_name: "", type: "" }]
  }), /step 1 name.*nonempty string/i);
});

test("requires the observed funnel title and rejects a conflicting returned funnel id", () => {
  assert.throws(() => normalize({ funnelData: { id: 1, title: "" } }), /funnel title.*nonempty string/i);
  assert.throws(() => normalize({ funnelData: { id: 2, title: "Store checkout" } }), /expected 1, received 2/i);
});

test("rejects an empty step array so coverage cannot advance on missing step evidence", () => {
  assert.throws(() => normalize({ records: [] }), /step records.*nonempty array/i);
});

test("validates the RPC written-row count instead of defaulting malformed results to zero", () => {
  assert.equal(normalizeFunnelKitWrittenRowCountV1(0), 0);
  assert.equal(normalizeFunnelKitWrittenRowCountV1("2"), 2);
  for (const badValue of [undefined, null, "", -1, 1.5, true]) {
    assert.throws(() => normalizeFunnelKitWrittenRowCountV1(badValue), /ingest row count.*nonnegative safe integer/i);
  }
});

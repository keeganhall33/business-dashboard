import test from "node:test";
import assert from "node:assert/strict";
import { selectPreviousSnapshot } from "../src/lib/dashboard/snapshot-selection";
import type { DashboardSnapshotRecord } from "../src/lib/supabase/queries";

test("selects newest snapshot strictly older than current (unsorted input, newer-first)", () => {
  const rows: DashboardSnapshotRecord[] = [
    {
      key: "meta",
      payload: { generatedAt: "2026-07-24T12:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-24T12:00:00.000Z",
      updated_at: "2026-07-24T12:01:00.000Z"
    },
    {
      key: "meta",
      payload: { generatedAt: "2026-07-23T12:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-23T12:00:00.000Z",
      updated_at: "2026-07-23T12:01:00.000Z"
    },
    {
      key: "meta",
      payload: { generatedAt: "2026-07-22T12:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-22T12:00:00.000Z",
      updated_at: "2026-07-22T12:01:00.000Z"
    }
  ];

  const prev = selectPreviousSnapshot<{ generatedAt: string }>(rows, "2026-07-24T12:00:00.000Z");
  assert.ok(prev);
  assert.equal(prev.payload.generatedAt, "2026-07-23T12:00:00.000Z");
});

test("rejects same-time candidates and invalid timestamps", () => {
  const rows: DashboardSnapshotRecord[] = [
    {
      key: "meta",
      payload: { generatedAt: "bad" },
      mode: null,
      generated_at: "bad",
      updated_at: null
    },
    {
      key: "meta",
      payload: { generatedAt: "2026-07-24T00:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-24T00:00:00.000Z",
      updated_at: null
    }
  ];

  const prev = selectPreviousSnapshot<{ generatedAt: string }>(rows, "2026-07-24T00:00:00.000Z");
  assert.equal(prev, null);
});

test("fallback current older than some history rows: does not select newer rows", () => {
  const rows: DashboardSnapshotRecord[] = [
    {
      key: "meta",
      payload: { generatedAt: "2026-07-25T00:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-25T00:00:00.000Z",
      updated_at: null
    },
    {
      key: "meta",
      payload: { generatedAt: "2026-07-23T00:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-23T00:00:00.000Z",
      updated_at: null
    }
  ];

  const prev = selectPreviousSnapshot<{ generatedAt: string }>(rows, "2026-07-24T00:00:00.000Z");
  assert.ok(prev);
  assert.equal(prev.payload.generatedAt, "2026-07-23T00:00:00.000Z");
});

test("duplicate timestamps: prefers generated_at source and later updated_at deterministically", () => {
  const rows: DashboardSnapshotRecord[] = [
    {
      key: "meta",
      payload: { generatedAt: "2026-07-23T00:00:00.000Z" },
      mode: null,
      generated_at: null,
      updated_at: "2026-07-23T00:10:00.000Z"
    },
    {
      key: "meta",
      payload: { generatedAt: "2026-07-23T00:00:00.000Z" },
      mode: null,
      generated_at: "2026-07-23T00:00:00.000Z",
      updated_at: "2026-07-23T00:00:01.000Z"
    }
  ];

  const prev = selectPreviousSnapshot<{ generatedAt: string }>(rows, "2026-07-24T00:00:00.000Z");
  assert.ok(prev);
  assert.equal(prev.timestampSource, "generated_at");
});

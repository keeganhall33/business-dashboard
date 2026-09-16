import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ClarityExportPayloadV1 } from "@/lib/website-conversion/clarity-export-adapter-v1";
import {
  fingerprintClarityIngestionSnapshotV1,
  loadClarityIngestionSnapshotV1,
  persistClarityIngestionSnapshotV1,
  type ClarityIngestionSnapshotStoreV1
} from "@/lib/website-conversion/clarity-ingestion-snapshot-loader-v1";
import { compileClarityIngestionSnapshotV1, type ClarityIngestionSnapshotV1 } from "@/lib/website-conversion/clarity-ingestion-snapshot-v1";

const NOW = "2026-09-14T10:00:00.000Z";

function payload(overrides: Partial<ClarityExportPayloadV1> = {}): ClarityExportPayloadV1 {
  return {
    projectId: "project-1",
    period: {
      id: "2026-09-07_2026-09-14",
      startAt: "2026-09-07T07:00:00.000Z",
      endAt: "2026-09-14T07:00:00.000Z",
      timeZone: "America/Los_Angeles"
    },
    extractedAt: "2026-09-14T08:00:00.000Z",
    metrics: { sessions: 100, users: 70, dead_clicks: 3 },
    smartEvents: [{ observationId: "cart", name: "Add to cart", count: 8 }],
    ...overrides
  };
}

function snapshot(overrides: Partial<ClarityExportPayloadV1> = {}): ClarityIngestionSnapshotV1 {
  return compileClarityIngestionSnapshotV1({ current: payload(overrides), now: NOW, staleAfterHours: 240 });
}

function row(value: ClarityIngestionSnapshotV1, persistedAt = "2026-09-14T08:01:00.000Z") {
  return {
    snapshot_id: value.snapshotId,
    canonical_fingerprint: fingerprintClarityIngestionSnapshotV1(value),
    project_id: value.projectId,
    reporting_window_start: value.reportingWindow.startAt,
    reporting_window_end: value.reportingWindow.endAt,
    reporting_timezone: value.reportingWindow.timeZone,
    partial_day: value.reportingWindow.partialDay,
    extracted_at: value.extractedAt,
    source_state: value.sourceState,
    source_reason: value.sourceReason,
    empty_snapshot: Object.values(value.metrics).every((metric) => metric.value == null || metric.value === 0)
      && value.funnel.every((stage) => stage.count == null || stage.count === 0),
    evidence_refs: [...value.evidenceRefs],
    snapshot_json: structuredClone(value),
    persisted_at: persistedAt
  };
}

function store(overrides: Partial<ClarityIngestionSnapshotStoreV1> = {}): ClarityIngestionSnapshotStoreV1 {
  const value = snapshot();
  return {
    persistSnapshot: async (input) => [{
      status: "PERSISTED",
      snapshot_id: input.in_snapshot_id,
      canonical_fingerprint: input.in_canonical_fingerprint
    }],
    loadSnapshots: async () => [row(value)],
    ...overrides
  };
}

test("persists the canonical snapshot idempotently with an immutable fingerprint", async () => {
  const value = snapshot();
  const calls: Readonly<Record<string, unknown>>[] = [];
  const source = store({
    persistSnapshot: async (input) => {
      calls.push(input);
      return [{ status: calls.length === 1 ? "PERSISTED" : "IDEMPOTENT", snapshot_id: value.snapshotId, canonical_fingerprint: input.in_canonical_fingerprint }];
    }
  });
  const first = await persistClarityIngestionSnapshotV1({ snapshot: value, store: source });
  const second = await persistClarityIngestionSnapshotV1({ snapshot: structuredClone(value), store: source });
  assert.equal(first.state, "PERSISTED");
  assert.equal(second.state, "IDEMPOTENT");
  assert.equal(first.canonicalFingerprint, second.canonicalFingerprint);
  assert.equal(calls[0]?.in_reporting_timezone, "America/Los_Angeles");
  assert.deepEqual(calls[0]?.in_evidence_refs, value.evidenceRefs);
});

test("refuses a different fingerprint for the same source and Pacific window", async () => {
  const value = snapshot();
  const result = await persistClarityIngestionSnapshotV1({
    snapshot: value,
    store: store({ persistSnapshot: async () => [{ status: "CONFLICTING", snapshot_id: value.snapshotId, canonical_fingerprint: "other" }] })
  });
  assert.equal(result.state, "CONFLICTING");
  assert.equal(result.reason, "WINDOW_FINGERPRINT_CONFLICT");
});

test("loads only the exact Pacific reporting window and preserves canonical lineage", async () => {
  const value = snapshot();
  const queries: unknown[] = [];
  const result = await loadClarityIngestionSnapshotV1({
    projectId: value.projectId,
    reportingWindow: value.reportingWindow,
    now: NOW,
    store: store({ loadSnapshots: async (input) => { queries.push(input); return [row(value)]; } })
  });
  assert.equal(result.state, "PRODUCTION");
  assert.equal(result.snapshot?.snapshotId, value.snapshotId);
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(Object.isFrozen(result.snapshot?.metrics), true);
  assert.equal(result.canonicalFingerprint, fingerprintClarityIngestionSnapshotV1(value));
  assert.deepEqual(queries, [{ projectId: "project-1", startAt: "2026-09-07T07:00:00.000Z", endAt: "2026-09-14T07:00:00.000Z" }]);
});

test("keeps partial day, stale transition, empty, and unavailable states distinct", async () => {
  const partial = snapshot({ period: { ...payload().period, partialDay: true }, sourceStatus: { state: "PARTIAL", reason: "Pacific day incomplete" } });
  const empty = snapshot({ metrics: {}, smartEvents: [] });
  const unavailable = snapshot({ metrics: {}, smartEvents: [], sourceStatus: { state: "UNAVAILABLE", reason: "Export unavailable" } });
  const partialResult = await loadClarityIngestionSnapshotV1({ projectId: partial.projectId, reportingWindow: partial.reportingWindow, now: NOW, store: store({ loadSnapshots: async () => [row(partial)] }) });
  const staleResult = await loadClarityIngestionSnapshotV1({ projectId: snapshot().projectId, reportingWindow: snapshot().reportingWindow, now: "2026-09-20T10:00:00.000Z", store: store() });
  const emptyResult = await loadClarityIngestionSnapshotV1({ projectId: empty.projectId, reportingWindow: empty.reportingWindow, now: NOW, store: store({ loadSnapshots: async () => [row(empty)] }) });
  const unavailableResult = await loadClarityIngestionSnapshotV1({ projectId: unavailable.projectId, reportingWindow: unavailable.reportingWindow, now: NOW, store: store({ loadSnapshots: async () => [row(unavailable)] }) });
  assert.equal(partialResult.state, "PARTIAL");
  assert.equal(staleResult.state, "STALE");
  assert.equal(staleResult.snapshot?.sourceState, "AVAILABLE");
  assert.equal(emptyResult.state, "EMPTY");
  assert.equal(unavailableResult.state, "UNAVAILABLE");
  assert.equal(unavailableResult.reason, "Export unavailable");
});

test("returns unauthorized, unavailable, and conflicting states without affecting other sources", async () => {
  const value = snapshot();
  const unauthorizedResult = await loadClarityIngestionSnapshotV1({
    projectId: value.projectId, reportingWindow: value.reportingWindow,
    store: store({ loadSnapshots: async () => { throw { code: "42501", message: "permission denied" }; } })
  });
  const unavailableResult = await loadClarityIngestionSnapshotV1({
    projectId: value.projectId, reportingWindow: value.reportingWindow,
    store: store({ loadSnapshots: async () => { throw new Error("network unavailable"); } })
  });
  const mismatched = row(value);
  mismatched.evidence_refs = ["tampered"];
  const conflictResult = await loadClarityIngestionSnapshotV1({
    projectId: value.projectId, reportingWindow: value.reportingWindow,
    store: store({ loadSnapshots: async () => [mismatched] })
  });
  assert.equal(unauthorizedResult.state, "UNAUTHORIZED");
  assert.equal(unavailableResult.state, "UNAVAILABLE");
  assert.equal(conflictResult.state, "CONFLICTING");
  for (const result of [unauthorizedResult, unavailableResult, conflictResult]) {
    assert.deepEqual(result.sourceIsolation, { clarity: "ISOLATED", ga4: "UNAFFECTED", woo: "UNAFFECTED", funnelkit: "UNAFFECTED", meta: "UNAFFECTED" });
  }
});

test("migration applies least privilege RLS and a security-invoker projection", () => {
  const migration = readFileSync("supabase/migrations/20260916035245_clarity_ingestion_snapshot_v1.sql", "utf8");
  assert.match(migration, /alter table exec_dashboard\.clarity_ingestion_snapshots_v1 enable row level security/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /grant select, insert on table exec_dashboard\.clarity_ingestion_snapshots_v1 to service_role/i);
  assert.match(migration, /for select\s+to service_role\s+using \(true\)/i);
  assert.match(migration, /for insert\s+to service_role\s+with check \(true\)/i);
  assert.match(migration, /grant execute on function public\.persist_clarity_ingestion_snapshot_v1[\s\S]+to service_role/i);
  assert.doesNotMatch(migration, /security definer|grant all|auth\.role\(\)/i);
});

import "@/lib/server-only";

import { createHash } from "node:crypto";

import type { ClarityIngestionSnapshotV1 } from "@/lib/website-conversion/clarity-ingestion-snapshot-v1";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const MAX_ROWS = 2;
const DEFAULT_STALE_AFTER_HOURS = 48;

export type ClaritySnapshotReadStateV1 =
  | "PRODUCTION"
  | "EMPTY"
  | "STALE"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "UNAUTHORIZED"
  | "CONFLICTING";

export type ClaritySnapshotPersistenceStateV1 =
  | "PERSISTED"
  | "IDEMPOTENT"
  | "CONFLICTING"
  | "UNAVAILABLE"
  | "UNAUTHORIZED";

type PersistenceRowV1 = {
  status: "PERSISTED" | "IDEMPOTENT" | "CONFLICTING";
  snapshot_id: string;
  canonical_fingerprint: string;
};

type SnapshotRowV1 = {
  snapshot_id: string;
  canonical_fingerprint: string;
  project_id: string;
  reporting_window_start: string;
  reporting_window_end: string;
  reporting_timezone: string;
  partial_day: boolean;
  extracted_at: string;
  source_state: ClarityIngestionSnapshotV1["sourceState"];
  source_reason: string | null;
  empty_snapshot: boolean;
  evidence_refs: string[];
  snapshot_json: unknown;
  persisted_at: string;
};

export type ClarityIngestionSnapshotStoreV1 = {
  persistSnapshot: (input: Readonly<Record<string, unknown>>) => Promise<readonly unknown[] | null>;
  loadSnapshots: (input: {
    projectId: string;
    startAt: string;
    endAt: string;
  }) => Promise<readonly unknown[] | null>;
};

export type ClaritySnapshotPersistenceResultV1 = {
  state: ClaritySnapshotPersistenceStateV1;
  snapshotId: string | null;
  canonicalFingerprint: string;
  reason: string | null;
};

export type ClaritySnapshotLoadResultV1 = {
  state: ClaritySnapshotReadStateV1;
  snapshot: ClarityIngestionSnapshotV1 | null;
  canonicalFingerprint: string | null;
  persistedAt: string | null;
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  reason: string | null;
  sourceIsolation: ClarityIngestionSnapshotV1["sourceIsolation"];
};

const SOURCE_ISOLATION: ClarityIngestionSnapshotV1["sourceIsolation"] = Object.freeze({
  clarity: "ISOLATED",
  ga4: "UNAFFECTED",
  woo: "UNAFFECTED",
  funnelkit: "UNAFFECTED",
  meta: "UNAFFECTED"
});

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const normalized = text(value);
  return normalized && Number.isFinite(Date.parse(normalized))
    ? new Date(Date.parse(normalized)).toISOString()
    : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)])
    );
  }
  return value;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export function fingerprintClarityIngestionSnapshotV1(snapshot: ClarityIngestionSnapshotV1): string {
  return createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
}

function emptySnapshot(snapshot: ClarityIngestionSnapshotV1): boolean {
  const metricValues = Object.values(snapshot.metrics).map((metric) => metric.value);
  const funnelValues = snapshot.funnel.map((stage) => stage.count);
  return [...metricValues, ...funnelValues].every((value) => value == null || value === 0)
    && snapshot.dimensions.every((dimension) => dimension.count === 0)
    && snapshot.findings.length === 0;
}

function canonicalSnapshot(value: unknown): ClarityIngestionSnapshotV1 | null {
  const snapshot = record(value);
  const window = record(snapshot?.reportingWindow);
  const isolation = record(snapshot?.sourceIsolation);
  if (!snapshot || snapshot.contractVersion !== "ClarityIngestionSnapshotV1"
      || !text(snapshot.snapshotId) || !text(snapshot.projectId) || !text(snapshot.extractedAt)
      || !window || !timestamp(window.startAt) || !timestamp(window.endAt)
      || window.timeZone !== "America/Los_Angeles" || typeof window.partialDay !== "boolean"
      || !record(snapshot.metrics) || !Array.isArray(snapshot.funnel) || !Array.isArray(snapshot.dimensions)
      || !Array.isArray(snapshot.findings) || !Array.isArray(snapshot.evidenceRefs)
      || !snapshot.evidenceRefs.every((item) => text(item)) || !isolation
      || isolation.clarity !== "ISOLATED" || isolation.ga4 !== "UNAFFECTED"
      || isolation.woo !== "UNAFFECTED" || isolation.funnelkit !== "UNAFFECTED"
      || isolation.meta !== "UNAFFECTED") return null;
  try {
    emptySnapshot(snapshot as unknown as ClarityIngestionSnapshotV1);
  } catch {
    return null;
  }
  return snapshot as unknown as ClarityIngestionSnapshotV1;
}

function unauthorized(error: unknown): boolean {
  const value = record(error);
  const code = text(value?.code)?.toUpperCase();
  const message = text(value?.message)?.toLowerCase() ?? "";
  return code === "42501" || code === "PGRST301" || /unauthori[sz]ed|permission denied|jwt/.test(message);
}

function defaultStore(): ClarityIngestionSnapshotStoreV1 {
  const client = getSupabaseServerClient();
  return {
    async persistSnapshot(input) {
      const { data, error } = await client.rpc("persist_clarity_ingestion_snapshot_v1", input);
      if (error) throw error;
      return data;
    },
    async loadSnapshots(input) {
      const { data, error } = await client.from("clarity_ingestion_snapshots_v1")
        .select("snapshot_id,canonical_fingerprint,project_id,reporting_window_start,reporting_window_end,reporting_timezone,partial_day,extracted_at,source_state,source_reason,empty_snapshot,evidence_refs,snapshot_json,persisted_at")
        .eq("project_id", input.projectId)
        .eq("reporting_window_start", input.startAt)
        .eq("reporting_window_end", input.endAt)
        .limit(MAX_ROWS);
      if (error) throw error;
      return data;
    }
  };
}

function persistenceRow(value: unknown): PersistenceRowV1 | null {
  const row = record(value);
  const status = text(row?.status);
  const snapshotId = text(row?.snapshot_id);
  const fingerprint = text(row?.canonical_fingerprint);
  if (!snapshotId || !fingerprint || !["PERSISTED", "IDEMPOTENT", "CONFLICTING"].includes(status ?? "")) return null;
  return { status: status as PersistenceRowV1["status"], snapshot_id: snapshotId, canonical_fingerprint: fingerprint };
}

function snapshotRow(value: unknown): SnapshotRowV1 | null {
  const row = record(value);
  const evidenceRefs = Array.isArray(row?.evidence_refs) && row.evidence_refs.every((item) => text(item))
    ? row.evidence_refs as string[]
    : null;
  const sourceState = text(row?.source_state);
  if (!row || !text(row.snapshot_id) || !text(row.canonical_fingerprint) || !text(row.project_id)
      || !timestamp(row.reporting_window_start) || !timestamp(row.reporting_window_end)
      || row.reporting_timezone !== "America/Los_Angeles" || typeof row.partial_day !== "boolean"
      || !timestamp(row.extracted_at) || !["AVAILABLE", "PARTIAL", "STALE", "UNKNOWN", "UNAVAILABLE"].includes(sourceState ?? "")
      || (row.source_reason != null && !text(row.source_reason)) || typeof row.empty_snapshot !== "boolean"
      || !evidenceRefs || !record(row.snapshot_json) || !timestamp(row.persisted_at)) return null;
  return row as unknown as SnapshotRowV1;
}

function unavailable(reason: string): ClaritySnapshotLoadResultV1 {
  return {
    state: "UNAVAILABLE",
    snapshot: null,
    canonicalFingerprint: null,
    persistedAt: null,
    freshness: "UNKNOWN",
    reason,
    sourceIsolation: SOURCE_ISOLATION
  };
}

export async function persistClarityIngestionSnapshotV1(input: {
  snapshot: ClarityIngestionSnapshotV1;
  store?: ClarityIngestionSnapshotStoreV1;
}): Promise<ClaritySnapshotPersistenceResultV1> {
  const fingerprint = fingerprintClarityIngestionSnapshotV1(input.snapshot);
  const window = input.snapshot.reportingWindow;
  try {
    const rows = await (input.store ?? defaultStore()).persistSnapshot({
      in_snapshot_id: input.snapshot.snapshotId,
      in_canonical_fingerprint: fingerprint,
      in_project_id: input.snapshot.projectId,
      in_reporting_window_start: window.startAt,
      in_reporting_window_end: window.endAt,
      in_reporting_timezone: window.timeZone,
      in_partial_day: window.partialDay,
      in_extracted_at: input.snapshot.extractedAt,
      in_source_state: input.snapshot.sourceState,
      in_source_reason: input.snapshot.sourceReason,
      in_empty_snapshot: emptySnapshot(input.snapshot),
      in_evidence_refs: [...input.snapshot.evidenceRefs],
      in_snapshot_json: input.snapshot
    });
    if (!Array.isArray(rows) || rows.length !== 1) {
      return { state: "UNAVAILABLE", snapshotId: null, canonicalFingerprint: fingerprint, reason: "PERSISTENCE_RESPONSE_INVALID" };
    }
    const row = persistenceRow(rows[0]);
    if (!row) return { state: "UNAVAILABLE", snapshotId: null, canonicalFingerprint: fingerprint, reason: "PERSISTENCE_RESPONSE_INVALID" };
    if (row.status === "CONFLICTING" || row.canonical_fingerprint !== fingerprint) {
      return { state: "CONFLICTING", snapshotId: row.snapshot_id, canonicalFingerprint: fingerprint, reason: "WINDOW_FINGERPRINT_CONFLICT" };
    }
    return { state: row.status, snapshotId: row.snapshot_id, canonicalFingerprint: fingerprint, reason: null };
  } catch (error) {
    return {
      state: unauthorized(error) ? "UNAUTHORIZED" : "UNAVAILABLE",
      snapshotId: null,
      canonicalFingerprint: fingerprint,
      reason: unauthorized(error) ? "PERSISTENCE_UNAUTHORIZED" : "PERSISTENCE_UNAVAILABLE"
    };
  }
}

export async function loadClarityIngestionSnapshotV1(input: {
  projectId: string;
  reportingWindow: ClarityIngestionSnapshotV1["reportingWindow"];
  now?: string | Date;
  staleAfterHours?: number;
  store?: ClarityIngestionSnapshotStoreV1;
}): Promise<ClaritySnapshotLoadResultV1> {
  const projectId = text(input.projectId);
  const startAt = timestamp(input.reportingWindow?.startAt);
  const endAt = timestamp(input.reportingWindow?.endAt);
  const now = input.now instanceof Date ? input.now.toISOString() : timestamp(input.now ?? new Date().toISOString());
  const staleAfterHours = input.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS;
  if (!projectId || !startAt || !endAt || input.reportingWindow?.timeZone !== "America/Los_Angeles"
      || !now || !Number.isFinite(staleAfterHours) || staleAfterHours <= 0 || staleAfterHours > 720) {
    return unavailable("LOAD_REQUEST_INVALID");
  }
  try {
    const rows = await (input.store ?? defaultStore()).loadSnapshots({ projectId, startAt, endAt });
    if (!Array.isArray(rows) || rows.length === 0) return unavailable("SNAPSHOT_NOT_FOUND");
    if (rows.length > 1 || rows.length > MAX_ROWS) {
      return { ...unavailable("WINDOW_HAS_MULTIPLE_SNAPSHOTS"), state: "CONFLICTING" };
    }
    const row = snapshotRow(rows[0]);
    if (!row) return { ...unavailable("SNAPSHOT_ROW_INVALID"), state: "CONFLICTING" };
    const snapshot = canonicalSnapshot(row.snapshot_json);
    if (!snapshot) return { ...unavailable("SNAPSHOT_PAYLOAD_INVALID"), state: "CONFLICTING" };
    const fingerprint = fingerprintClarityIngestionSnapshotV1(snapshot);
    const immutableLineage = row.snapshot_id === snapshot.snapshotId
      && row.canonical_fingerprint === fingerprint
      && row.project_id === snapshot.projectId
      && startAt === timestamp(snapshot.reportingWindow?.startAt)
      && endAt === timestamp(snapshot.reportingWindow?.endAt)
      && row.reporting_timezone === snapshot.reportingWindow?.timeZone
      && row.partial_day === snapshot.reportingWindow?.partialDay
      && timestamp(row.extracted_at) === timestamp(snapshot.extractedAt)
      && row.source_state === snapshot.sourceState
      && row.source_reason === snapshot.sourceReason
      && row.empty_snapshot === emptySnapshot(snapshot)
      && JSON.stringify([...row.evidence_refs].sort()) === JSON.stringify([...snapshot.evidenceRefs].sort());
    if (!immutableLineage) {
      return { ...unavailable("IMMUTABLE_LINEAGE_CONFLICT"), state: "CONFLICTING", canonicalFingerprint: row.canonical_fingerprint };
    }

    const ageHours = (Date.parse(now) - Date.parse(row.extracted_at)) / 3_600_000;
    const stale = ageHours > staleAfterHours;
    let state: ClaritySnapshotReadStateV1;
    if (["UNKNOWN", "UNAVAILABLE"].includes(row.source_state)) state = "UNAVAILABLE";
    else if (row.source_state === "STALE" || stale) state = "STALE";
    else if (row.source_state === "PARTIAL" || row.partial_day) state = "PARTIAL";
    else if (row.empty_snapshot) state = "EMPTY";
    else state = "PRODUCTION";

    return {
      state,
      snapshot: freeze(snapshot),
      canonicalFingerprint: fingerprint,
      persistedAt: timestamp(row.persisted_at),
      freshness: state === "STALE" ? "STALE" : state === "UNAVAILABLE" ? "UNKNOWN" : "FRESH",
      reason: state === "UNAVAILABLE" ? row.source_reason ?? "SOURCE_UNAVAILABLE" : row.source_reason,
      sourceIsolation: SOURCE_ISOLATION
    };
  } catch (error) {
    if (unauthorized(error)) return { ...unavailable("LOAD_UNAUTHORIZED"), state: "UNAUTHORIZED" };
    return unavailable("LOAD_UNAVAILABLE");
  }
}

import type { DashboardSnapshotRecord } from "@/lib/supabase/queries";

type TimestampSource = {
  iso: string;
  source: "generated_at" | "payload.generatedAt";
};

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

function getCandidateTimestamp(row: DashboardSnapshotRecord): TimestampSource | null {
  const fromRow = parseIso(row.generated_at);
  if (fromRow != null) return { iso: row.generated_at as string, source: "generated_at" };

  const payload = row.payload as { generatedAt?: unknown } | null;
  const fromPayload = typeof payload?.generatedAt === "string" ? parseIso(payload.generatedAt) : null;
  if (fromPayload != null) return { iso: payload!.generatedAt as string, source: "payload.generatedAt" };

  return null;
}

export type PreviousSnapshotResult<T> = {
  payload: T;
  timestampIso: string;
  timestampSource: TimestampSource["source"];
};

/**
 * Choose the newest snapshot strictly older than the current timestamp.
 *
 * - Rejects invalid timestamps.
 * - Rejects candidates >= current.
 * - Deterministic for ties (prefers generated_at timestamps; then prefers later updated_at).
 */
export function selectPreviousSnapshot<T extends { generatedAt: string }>(
  rows: DashboardSnapshotRecord[] | undefined,
  currentTimestampIso: string | null | undefined
): PreviousSnapshotResult<T> | null {
  const currentTime = parseIso(currentTimestampIso);
  if (currentTime == null) return null;
  if (!rows?.length) return null;

  let best: {
    time: number;
    updatedAt: number;
    sourceRank: number;
    payload: T;
    iso: string;
    source: TimestampSource["source"];
  } | null = null;

  for (const row of rows) {
    const ts = getCandidateTimestamp(row);
    if (!ts) continue;
    const candidateTime = parseIso(ts.iso);
    if (candidateTime == null) continue;
    if (candidateTime >= currentTime) continue;

    const updatedAt = parseIso(row.updated_at) ?? 0;
    const sourceRank = ts.source === "generated_at" ? 2 : 1;

    const payload = row.payload as T | null;
    if (!payload || typeof payload.generatedAt !== "string") continue;

    if (!best) {
      best = { time: candidateTime, updatedAt, sourceRank, payload, iso: ts.iso, source: ts.source };
      continue;
    }

    if (candidateTime > best.time) {
      best = { time: candidateTime, updatedAt, sourceRank, payload, iso: ts.iso, source: ts.source };
      continue;
    }

    if (candidateTime === best.time) {
      if (sourceRank > best.sourceRank) {
        best = { time: candidateTime, updatedAt, sourceRank, payload, iso: ts.iso, source: ts.source };
        continue;
      }
      if (sourceRank === best.sourceRank && updatedAt > best.updatedAt) {
        best = { time: candidateTime, updatedAt, sourceRank, payload, iso: ts.iso, source: ts.source };
      }
    }
  }

  if (!best) return null;

  return {
    payload: best.payload,
    timestampIso: best.iso,
    timestampSource: best.source
  };
}

import type {
  ClarityBehaviorPeriodV1,
  ClarityEventObservationV1,
  ClarityMetricNameV1,
  ClarityMetricObservationV1,
  ClaritySourceStateV1
} from "@/lib/website-conversion/clarity-behavior-normalizer-v1";

export type ClarityExportDimensionKindV1 = "PAGE" | "DEVICE" | "BROWSER" | "OS" | "REGION" | "REFERRER" | "CHANNEL" | "CAMPAIGN";

export type ClarityExportPayloadV1 = {
  projectId: string;
  period: {
    id: string;
    startAt: string;
    endAt: string;
    timeZone: "America/Los_Angeles";
    partialDay?: boolean;
  };
  extractedAt: string;
  sourceStatus?: { state: ClaritySourceStateV1; reason?: string };
  metrics?: Readonly<Record<string, unknown>>;
  smartEvents?: readonly {
    observationId?: string;
    name?: string;
    count?: unknown;
    segment?: Readonly<Record<string, unknown>>;
    recordingLinks?: readonly string[];
  }[];
  dimensions?: Partial<Record<ClarityExportDimensionKindV1, readonly { value?: string; count?: unknown }[]>>;
};

export type ClarityExportAdapterResultV1 = {
  contractVersion: "ClarityExportAdapterResultV1";
  projectId: string;
  period: ClarityBehaviorPeriodV1;
  reportingWindow: {
    startAt: string;
    endAt: string;
    timeZone: "America/Los_Angeles";
    partialDay: boolean;
  };
  extractedAt: string;
  sourceState: ClaritySourceStateV1;
  sourceReason: string | null;
  dimensions: readonly {
    kind: ClarityExportDimensionKindV1;
    value: string;
    count: number;
    sourceState: ClaritySourceStateV1;
    evidenceRef: string;
  }[];
  recordingLinks: readonly string[];
  issues: readonly { path: string; reasonCode: "MALFORMED_FRAGMENT" | "UNSUPPORTED_METRIC" | "UNSAFE_LINK"; message: string }[];
  externalAccessPerformed: false;
  writesPerformed: false;
};

const METRIC_ALIASES: Readonly<Record<string, ClarityMetricNameV1>> = {
  sessions: "SESSIONS",
  total_sessions: "SESSIONS",
  users: "USERS",
  unique_users: "USERS",
  pages_per_session: "PAGES_PER_SESSION",
  scroll_depth: "SCROLL_DEPTH_PERCENT",
  scroll_depth_percent: "SCROLL_DEPTH_PERCENT",
  active_time: "ACTIVE_TIME_SECONDS",
  active_time_seconds: "ACTIVE_TIME_SECONDS",
  dead_clicks: "DEAD_CLICKS",
  quick_backs: "QUICK_BACKS",
  excessive_scrolls: "EXCESSIVE_SCROLLS",
  rage_clicks: "RAGE_CLICKS",
  purchases: "PURCHASES"
};
const METRICS = [...new Set(Object.values(METRIC_ALIASES))] as readonly ClarityMetricNameV1[];
const DIMENSIONS: readonly ClarityExportDimensionKindV1[] = ["PAGE", "DEVICE", "BROWSER", "OS", "REGION", "REFERRER", "CHANNEL", "CAMPAIGN"];
const STATES = new Set<ClaritySourceStateV1>(["AVAILABLE", "PARTIAL", "STALE", "UNKNOWN", "UNAVAILABLE"]);
const MAX_EVENTS = 2_000;
const MAX_DIMENSIONS = 1_000;
const MAX_LINKS = 100;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function time(value: unknown, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be a valid timestamp`);
  return new Date(Date.parse(normalized)).toISOString();
}

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function sourceState(payload: ClarityExportPayloadV1, extractedAt: string, now: string, staleAfterHours: number): ClaritySourceStateV1 {
  const supplied = payload.sourceStatus?.state ?? "AVAILABLE";
  if (!STATES.has(supplied)) throw new Error("sourceStatus.state is unsupported");
  if (["UNKNOWN", "UNAVAILABLE"].includes(supplied)) return supplied;
  const stale = Date.parse(now) - Date.parse(extractedAt) > staleAfterHours * 3_600_000;
  if (stale) return "STALE";
  if (payload.period.partialDay || supplied === "PARTIAL") return "PARTIAL";
  return supplied;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function link(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function mapClarityExportV1(
  payload: ClarityExportPayloadV1,
  options: { now: string; staleAfterHours?: number }
): ClarityExportAdapterResultV1 {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  const projectId = required(payload.projectId, "projectId");
  const periodId = required(payload.period?.id, "period.id");
  const startAt = time(payload.period?.startAt, "period.startAt");
  const endAt = time(payload.period?.endAt, "period.endAt");
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error("period endAt must be after startAt");
  if (payload.period?.timeZone !== "America/Los_Angeles") throw new Error("period timeZone must be America/Los_Angeles");
  const extractedAt = time(payload.extractedAt, "extractedAt");
  const now = time(options?.now, "now");
  const staleAfterHours = options?.staleAfterHours ?? 48;
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0 || staleAfterHours > 720) throw new Error("staleAfterHours is invalid");
  const overallState = sourceState(payload, extractedAt, now, staleAfterHours);
  const evidenceBase = `clarity:${projectId}:${periodId}:${extractedAt}`;
  const issues: ClarityExportAdapterResultV1["issues"][number][] = [];

  const suppliedMetrics = new Map<ClarityMetricNameV1, { value: number | null; invalid: boolean }>();
  for (const [rawName, rawValue] of Object.entries(payload.metrics ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const name = METRIC_ALIASES[key(rawName)];
    if (!name) {
      issues.push({ path: `metrics.${rawName}`, reasonCode: "UNSUPPORTED_METRIC", message: "Metric is not supported by the canonical contract" });
      continue;
    }
    if (suppliedMetrics.has(name)) {
      issues.push({ path: `metrics.${rawName}`, reasonCode: "MALFORMED_FRAGMENT", message: `Duplicate alias for ${name}` });
      continue;
    }
    const value = safeNumber(rawValue);
    suppliedMetrics.set(name, { value, invalid: rawValue != null && value == null });
    if (rawValue != null && value == null) {
      issues.push({ path: `metrics.${rawName}`, reasonCode: "MALFORMED_FRAGMENT", message: "Metric must be a finite non-negative number or null" });
    }
  }
  const metrics: ClarityMetricObservationV1[] = METRICS.map((name) => {
    const supplied = suppliedMetrics.get(name);
    return {
      name,
      value: supplied?.value ?? null,
      sourceState: supplied?.invalid ? "UNAVAILABLE" : supplied ? overallState : "UNKNOWN",
      evidenceRef: `${evidenceBase}:metric:${name}`
    };
  });

  const events: ClarityEventObservationV1[] = [];
  const links = new Set<string>();
  if (!Array.isArray(payload.smartEvents ?? [])) throw new Error("smartEvents must be an array");
  if ((payload.smartEvents?.length ?? 0) > MAX_EVENTS) throw new Error(`smartEvents exceeds ${MAX_EVENTS}`);
  for (const [index, item] of (payload.smartEvents ?? []).entries()) {
    const path = `smartEvents.${index}`;
    const observationId = typeof item?.observationId === "string" && item.observationId.trim() ? item.observationId.trim() : `${periodId}:${index}`;
    const name = typeof item?.name === "string" && item.name.trim() ? item.name.trim() : null;
    const count = safeNumber(item?.count);
    if (!name || count == null || !Number.isInteger(count)) {
      issues.push({ path, reasonCode: "MALFORMED_FRAGMENT", message: "Event requires a name and non-negative integer count" });
      continue;
    }
    const segmentEntries = Object.entries(item.segment ?? {}).map(([segmentKey, value]) => [segmentKey.trim(), typeof value === "string" ? value.trim() : ""] as const);
    const invalidSegment = segmentEntries.some(([segmentKey, value]) => !segmentKey || !value);
    if (invalidSegment) {
      issues.push({ path: `${path}.segment`, reasonCode: "MALFORMED_FRAGMENT", message: "Segment keys and values must be non-empty strings" });
      continue;
    }
    const segment = segmentEntries.length
      ? Object.fromEntries(segmentEntries.sort(([a], [b]) => a.localeCompare(b)))
      : undefined;
    events.push({ sourceObservationId: observationId, eventName: name, count, sourceState: overallState, evidenceRef: `${evidenceBase}:event:${observationId}`, segment });
    for (const [linkIndex, rawLink] of (item.recordingLinks ?? []).entries()) {
      const safe = link(rawLink);
      if (!safe) issues.push({ path: `${path}.recordingLinks.${linkIndex}`, reasonCode: "UNSAFE_LINK", message: "Only valid HTTPS links are retained" });
      else if (links.size < MAX_LINKS) links.add(safe);
    }
  }

  const dimensions: ClarityExportAdapterResultV1["dimensions"][number][] = [];
  for (const kind of DIMENSIONS) {
    const rows = payload.dimensions?.[kind] ?? [];
    if (!Array.isArray(rows)) {
      issues.push({ path: `dimensions.${kind}`, reasonCode: "MALFORMED_FRAGMENT", message: "Dimension must be an array" });
      continue;
    }
    for (const [index, row] of rows.entries()) {
      const value = typeof row?.value === "string" ? row.value.trim() : "";
      const count = safeNumber(row?.count);
      if (!value || count == null || !Number.isInteger(count)) {
        issues.push({ path: `dimensions.${kind}.${index}`, reasonCode: "MALFORMED_FRAGMENT", message: "Dimension requires a value and non-negative integer count" });
        continue;
      }
      dimensions.push({ kind, value, count, sourceState: overallState, evidenceRef: `${evidenceBase}:dimension:${kind}:${key(value)}` });
      if (dimensions.length > MAX_DIMENSIONS) throw new Error(`dimensions exceed ${MAX_DIMENSIONS}`);
    }
  }
  dimensions.sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value) || a.count - b.count);
  issues.sort((a, b) => a.path.localeCompare(b.path) || a.reasonCode.localeCompare(b.reasonCode));

  return freeze({
    contractVersion: "ClarityExportAdapterResultV1",
    projectId,
    period: { periodId, metrics, events },
    reportingWindow: { startAt, endAt, timeZone: "America/Los_Angeles", partialDay: payload.period.partialDay === true },
    extractedAt,
    sourceState: overallState,
    sourceReason: payload.sourceStatus?.reason?.trim() || null,
    dimensions,
    recordingLinks: [...links].sort((a, b) => a.localeCompare(b)),
    issues,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}

import { createHash } from "node:crypto";

import {
  mapClarityExportV1,
  type ClarityExportAdapterResultV1,
  type ClarityExportPayloadV1
} from "@/lib/website-conversion/clarity-export-adapter-v1";
import {
  normalizeClarityBehaviorV1,
  type ClarityBehaviorNormalizerResultV1
} from "@/lib/website-conversion/clarity-behavior-normalizer-v1";

export type ClarityIngestionSnapshotInputV1 = {
  current: ClarityExportPayloadV1;
  prior?: ClarityExportPayloadV1 | null;
  now: string;
  staleAfterHours?: number;
  findingLimit?: number;
};

export type ClarityIngestionSnapshotV1 = {
  contractVersion: "ClarityIngestionSnapshotV1";
  snapshotId: string;
  upsertKey: string;
  projectId: string;
  reportingWindow: ClarityExportAdapterResultV1["reportingWindow"];
  extractedAt: string;
  sourceState: ClarityExportAdapterResultV1["sourceState"];
  sourceReason: string | null;
  currentPeriodId: string;
  priorPeriodId: string | null;
  priorSourceState: ClarityExportAdapterResultV1["sourceState"] | null;
  metrics: ClarityBehaviorNormalizerResultV1["metrics"];
  deltas: ClarityBehaviorNormalizerResultV1["deltas"];
  funnel: ClarityBehaviorNormalizerResultV1["funnel"];
  segments: ClarityBehaviorNormalizerResultV1["segments"];
  findings: ClarityBehaviorNormalizerResultV1["findings"];
  dimensions: ClarityExportAdapterResultV1["dimensions"];
  recordingLinks: ClarityExportAdapterResultV1["recordingLinks"];
  issues: readonly {
    period: "CURRENT" | "PRIOR";
    path: string;
    reasonCode: ClarityExportAdapterResultV1["issues"][number]["reasonCode"];
    message: string;
  }[];
  evidenceRefs: readonly string[];
  sourceIsolation: {
    clarity: "ISOLATED";
    ga4: "UNAFFECTED";
    woo: "UNAFFECTED";
    funnelkit: "UNAFFECTED";
    meta: "UNAFFECTED";
  };
  externalAccessPerformed: false;
  writesPerformed: false;
};

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function identity(current: ClarityExportAdapterResultV1): string {
  const value = JSON.stringify({
    projectId: current.projectId,
    periodId: current.period.periodId,
    reportingWindow: current.reportingWindow,
    extractedAt: current.extractedAt
  });
  return createHash("sha256").update(value).digest("hex");
}

function issueRows(period: "CURRENT" | "PRIOR", result: ClarityExportAdapterResultV1) {
  return result.issues.map((issue) => ({ period, ...issue }));
}

export function compileClarityIngestionSnapshotV1(input: ClarityIngestionSnapshotInputV1): ClarityIngestionSnapshotV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const options = { now: input.now, staleAfterHours: input.staleAfterHours };
  const current = mapClarityExportV1(input.current, options);
  const prior = input.prior ? mapClarityExportV1(input.prior, options) : null;
  if (prior && prior.projectId !== current.projectId) throw new Error("prior projectId must match current projectId");

  const normalized = normalizeClarityBehaviorV1({
    current: current.period,
    prior: prior?.period,
    findingLimit: input.findingLimit
  });
  const hash = identity(current);
  const evidenceRefs = unique([
    ...Object.values(normalized.metrics).flatMap((metric) => metric.evidenceRefs),
    ...normalized.funnel.flatMap((stage) => stage.evidenceRefs),
    ...normalized.findings.flatMap((finding) => finding.evidenceRefs),
    ...current.dimensions.map((dimension) => dimension.evidenceRef),
    ...(prior?.period.metrics.map((metric) => metric.evidenceRef) ?? [])
  ]);
  const issues = [
    ...issueRows("CURRENT", current),
    ...(prior ? issueRows("PRIOR", prior) : [])
  ].sort((left, right) => left.period.localeCompare(right.period) || left.path.localeCompare(right.path) || left.reasonCode.localeCompare(right.reasonCode));

  return freeze({
    contractVersion: "ClarityIngestionSnapshotV1",
    snapshotId: `clarity_snapshot_${hash.slice(0, 20)}`,
    upsertKey: `clarity:${current.projectId}:${hash}`,
    projectId: current.projectId,
    reportingWindow: current.reportingWindow,
    extractedAt: current.extractedAt,
    sourceState: current.sourceState,
    sourceReason: current.sourceReason,
    currentPeriodId: normalized.currentPeriodId,
    priorPeriodId: normalized.priorPeriodId,
    priorSourceState: prior?.sourceState ?? null,
    metrics: normalized.metrics,
    deltas: normalized.deltas,
    funnel: normalized.funnel,
    segments: normalized.segments,
    findings: normalized.findings,
    dimensions: current.dimensions,
    recordingLinks: current.recordingLinks,
    issues,
    evidenceRefs,
    sourceIsolation: {
      clarity: "ISOLATED",
      ga4: "UNAFFECTED",
      woo: "UNAFFECTED",
      funnelkit: "UNAFFECTED",
      meta: "UNAFFECTED"
    },
    externalAccessPerformed: false,
    writesPerformed: false
  });
}

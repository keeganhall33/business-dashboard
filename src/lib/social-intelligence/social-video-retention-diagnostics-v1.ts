import { SOCIAL_PLATFORMS_V1, type SocialPlatformV1 } from "./social-canonical-v1";

export const SOCIAL_VIDEO_RETENTION_DIAGNOSTICS_V1_VERSION = "SocialVideoRetentionDiagnosticsV1" as const;
export const SOCIAL_VIDEO_RETENTION_MAX_CHECKPOINTS_V1 = 100;

export type SocialVideoRetentionSourceStateV1 = "COMPLETE" | "PARTIAL" | "CONFLICTED" | "MISSING";

export type SocialVideoRetentionReasonV1 =
  | "SOURCE_NOT_COMPLETE"
  | "EVIDENCE_FROM_FUTURE"
  | "EVIDENCE_TOO_OLD"
  | "INSUFFICIENT_CHECKPOINTS";

export type SocialVideoRetentionCheckpointInputV1 = Readonly<{
  elapsedSeconds: number;
  retainedPct: number;
  evidenceRefs: readonly string[];
}>;

export type SocialVideoRetentionCheckpointV1 = Readonly<{
  elapsedSeconds: number;
  retainedPct: number;
  evidenceRefs: readonly string[];
}>;

export type SocialVideoRetentionDiagnosticsInputV1 = Readonly<{
  platform: SocialPlatformV1;
  contentId: string;
  durationSeconds: number;
  sourceState: SocialVideoRetentionSourceStateV1;
  observedAt: string;
  capturedAt: string;
  evaluatedAt: string;
  maxEvidenceAgeHours: number;
  sourceSnapshotRef: string;
  metricDefinitionRef: string;
  evidenceRefs: readonly string[];
  checkpoints: readonly SocialVideoRetentionCheckpointInputV1[];
  completionRatePct?: number | null;
  rewatchRatePct?: number | null;
  openingBoundarySeconds?: number | null;
  revealAtSeconds?: number | null;
}>;

export type SocialVideoRetentionDropV1 = Readonly<{
  fromElapsedSeconds: number;
  toElapsedSeconds: number;
  percentagePointDrop: number;
  evidenceRefs: readonly string[];
}>;

export type SocialVideoRetentionDiagnosticsV1 = Readonly<{
  contractVersion: typeof SOCIAL_VIDEO_RETENTION_DIAGNOSTICS_V1_VERSION;
  platform: SocialPlatformV1;
  contentId: string;
  durationSeconds: number;
  sourceState: SocialVideoRetentionSourceStateV1;
  status: "READY" | "VERIFY_REQUIRED";
  reasons: readonly SocialVideoRetentionReasonV1[];
  observedAt: string;
  capturedAt: string;
  evaluatedAt: string;
  sourceSnapshotRef: string;
  metricDefinitionRef: string;
  checkpoints: readonly SocialVideoRetentionCheckpointV1[];
  openingRetentionPct: number | null;
  revealRetentionPct: number | null;
  completionRatePct: number | null;
  rewatchRatePct: number | null;
  largestObservedDrop: SocialVideoRetentionDropV1 | null;
  evidenceRefs: readonly string[];
  interpretation: "DIRECT_PROVIDER_RETENTION_OBSERVATION_ONLY";
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  crossPlatformComparisonAuthority: "NONE";
  recommendationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  notificationAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

const PROHIBITED_RAW_TEXT_KEYS = new Set([
  "caption",
  "captionText",
  "transcript",
  "transcriptText",
  "comment",
  "commentText",
  "rawResponse",
  "rawPayload",
  "providerPayload"
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function assertNoRawText(value: unknown, path: string, seen = new Set<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  for (const [key, child] of Object.entries(object)) {
    if (PROHIBITED_RAW_TEXT_KEYS.has(key)) {
      throw new Error(`${path}.${key} is prohibited; retain opaque evidence references instead`);
    }
    assertNoRawText(child, `${path}.${key}`, seen);
  }
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty`);
  return value.trim();
}

function timestamp(value: unknown, field: string): string {
  const normalized = nonEmpty(value, field);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function finite(value: unknown, field: string, min: number, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function percent(value: unknown, field: string): number {
  return finite(value, field, 0, 100);
}

function optionalPercent(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  return percent(value, field);
}

function optionalSecond(value: unknown, field: string, durationSeconds: number): number | null {
  if (value === undefined || value === null) return null;
  return finite(value, field, 0, durationSeconds);
}

function uniqueRefs(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  const refs = [...new Set(values.map((value, index) => nonEmpty(value, `${field}[${index}]`)))].sort((a, b) => a.localeCompare(b));
  if (!refs.length) throw new Error(`${field} must contain at least one evidence reference`);
  return refs;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function exactCheckpointPct(
  checkpoints: readonly SocialVideoRetentionCheckpointV1[],
  elapsedSeconds: number | null
): number | null {
  if (elapsedSeconds === null) return null;
  return checkpoints.find((row) => row.elapsedSeconds === elapsedSeconds)?.retainedPct ?? null;
}

function largestDrop(checkpoints: readonly SocialVideoRetentionCheckpointV1[]): SocialVideoRetentionDropV1 | null {
  let result: SocialVideoRetentionDropV1 | null = null;
  for (let index = 1; index < checkpoints.length; index += 1) {
    const previous = checkpoints[index - 1]!;
    const current = checkpoints[index]!;
    const drop = round(previous.retainedPct - current.retainedPct);
    if (drop <= 0 || (result && drop <= result.percentagePointDrop)) continue;
    result = deepFreeze({
      fromElapsedSeconds: previous.elapsedSeconds,
      toElapsedSeconds: current.elapsedSeconds,
      percentagePointDrop: drop,
      evidenceRefs: [...new Set([...previous.evidenceRefs, ...current.evidenceRefs])].sort((a, b) => a.localeCompare(b))
    });
  }
  return result;
}

export function compileSocialVideoRetentionDiagnosticsV1(
  input: SocialVideoRetentionDiagnosticsInputV1
): SocialVideoRetentionDiagnosticsV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");
  if (!SOCIAL_PLATFORMS_V1.includes(input.platform)) throw new Error("platform is unsupported");

  const contentId = nonEmpty(input.contentId, "contentId");
  const durationSeconds = finite(input.durationSeconds, "durationSeconds", Number.EPSILON);
  if (!(["COMPLETE", "PARTIAL", "CONFLICTED", "MISSING"] as const).includes(input.sourceState)) {
    throw new Error("sourceState is unsupported");
  }
  const observedAt = timestamp(input.observedAt, "observedAt");
  const capturedAt = timestamp(input.capturedAt, "capturedAt");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const maxEvidenceAgeHours = finite(input.maxEvidenceAgeHours, "maxEvidenceAgeHours", 0);
  const sourceSnapshotRef = nonEmpty(input.sourceSnapshotRef, "sourceSnapshotRef");
  const metricDefinitionRef = nonEmpty(input.metricDefinitionRef, "metricDefinitionRef");
  const evidenceRefs = uniqueRefs(input.evidenceRefs, "evidenceRefs");
  const completionRatePct = optionalPercent(input.completionRatePct, "completionRatePct");
  const rewatchRatePct = optionalPercent(input.rewatchRatePct, "rewatchRatePct");
  const openingBoundarySeconds = optionalSecond(input.openingBoundarySeconds, "openingBoundarySeconds", durationSeconds);
  const revealAtSeconds = optionalSecond(input.revealAtSeconds, "revealAtSeconds", durationSeconds);

  if (!Array.isArray(input.checkpoints)) throw new Error("checkpoints must be an array");
  if (input.checkpoints.length > SOCIAL_VIDEO_RETENTION_MAX_CHECKPOINTS_V1) {
    throw new Error("checkpoints exceed the supported bound");
  }

  const checkpoints = input.checkpoints.map((row, index) => deepFreeze({
    elapsedSeconds: finite(row.elapsedSeconds, `checkpoints[${index}].elapsedSeconds`, 0, durationSeconds),
    retainedPct: percent(row.retainedPct, `checkpoints[${index}].retainedPct`),
    evidenceRefs: uniqueRefs(row.evidenceRefs, `checkpoints[${index}].evidenceRefs`)
  }));

  for (let index = 1; index < checkpoints.length; index += 1) {
    if (checkpoints[index]!.elapsedSeconds <= checkpoints[index - 1]!.elapsedSeconds) {
      throw new Error("checkpoints must be strictly ordered by elapsedSeconds with no duplicates");
    }
  }

  const observedAtMs = Date.parse(observedAt);
  const capturedAtMs = Date.parse(capturedAt);
  const evaluatedAtMs = Date.parse(evaluatedAt);
  if (capturedAtMs < observedAtMs) throw new Error("capturedAt must not precede observedAt");

  const reasons: SocialVideoRetentionReasonV1[] = [];
  if (input.sourceState !== "COMPLETE") reasons.push("SOURCE_NOT_COMPLETE");
  if (observedAtMs > evaluatedAtMs || capturedAtMs > evaluatedAtMs) reasons.push("EVIDENCE_FROM_FUTURE");
  if (evaluatedAtMs >= capturedAtMs && evaluatedAtMs - capturedAtMs > maxEvidenceAgeHours * 3_600_000) {
    reasons.push("EVIDENCE_TOO_OLD");
  }
  if (checkpoints.length < 2) reasons.push("INSUFFICIENT_CHECKPOINTS");

  const normalizedReasons = [...new Set(reasons)].sort((a, b) => a.localeCompare(b));
  const ready = normalizedReasons.length === 0;
  const acceptedCheckpoints = ready ? checkpoints : [];

  return deepFreeze({
    contractVersion: SOCIAL_VIDEO_RETENTION_DIAGNOSTICS_V1_VERSION,
    platform: input.platform,
    contentId,
    durationSeconds,
    sourceState: input.sourceState,
    status: ready ? ("READY" as const) : ("VERIFY_REQUIRED" as const),
    reasons: normalizedReasons,
    observedAt,
    capturedAt,
    evaluatedAt,
    sourceSnapshotRef,
    metricDefinitionRef,
    checkpoints: acceptedCheckpoints,
    openingRetentionPct: ready ? exactCheckpointPct(checkpoints, openingBoundarySeconds) : null,
    revealRetentionPct: ready ? exactCheckpointPct(checkpoints, revealAtSeconds) : null,
    completionRatePct: ready ? completionRatePct : null,
    rewatchRatePct: ready ? rewatchRatePct : null,
    largestObservedDrop: ready ? largestDrop(checkpoints) : null,
    evidenceRefs: ready ? evidenceRefs : [],
    interpretation: "DIRECT_PROVIDER_RETENTION_OBSERVATION_ONLY" as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    crossPlatformComparisonAuthority: "NONE" as const,
    recommendationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "Retention values are provider-reported observations under the cited metric definition; platform semantics must not be silently equated.",
      "Opening and reveal retention are surfaced only when an exact observed checkpoint exists at the caller-supplied boundary; no interpolation is invented.",
      "Observed drop-off, completion, or rewatch values do not establish why viewers behaved that way, business attribution, competitor performance, or future results.",
      "This contract authorizes no posting, provider write, paid amplification, recommendation execution, notification, or external action."
    ]
  });
}

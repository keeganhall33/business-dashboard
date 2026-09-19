import type {
  CampaignSteeringReviewSignalV1,
  StrategicCampaignCheckpointEvidenceV1
} from "./strategic-campaign-steering-v1";

export const STRATEGIC_CAMPAIGN_CHECKPOINT_READINESS_VERSION_V1 =
  "StrategicCampaignCheckpointReadinessV1" as const;

export type StrategicCampaignCheckpointTruthStateV1 =
  | "KNOWN"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type StrategicCampaignCheckpointSupportV1 = Readonly<{
  truthState: StrategicCampaignCheckpointTruthStateV1;
  campaignId: string;
  reviewSignal: CampaignSteeringReviewSignalV1;
  measurementStatus: StrategicCampaignCheckpointEvidenceV1["measurementStatus"];
  provenance: StrategicCampaignCheckpointEvidenceV1["provenance"];
  observedAt: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  experimentId?: string | null;
  allocationId?: string | null;
}>;

export type StrategicCampaignCheckpointReadinessReasonV1 =
  | "INVALID_INPUT"
  | "SUPPORT_NOT_KNOWN"
  | "CAMPAIGN_IDENTITY_MISMATCH"
  | "SIGNAL_IDENTITY_MISMATCH"
  | "MEASUREMENT_STATUS_MISMATCH"
  | "PROVENANCE_MISMATCH"
  | "OBSERVED_AT_MISMATCH"
  | "SOURCE_REF_NOT_SUPPORTED"
  | "MISSING_EVIDENCE_REFS"
  | "MISSING_SOURCE_REFS"
  | "UNSAFE_REFERENCE"
  | "FUTURE_EVIDENCE"
  | "STALE_EVIDENCE"
  | "MISSING_EXPERIMENT_ID"
  | "EXPERIMENT_IDENTITY_MISMATCH"
  | "MISSING_ALLOCATION_ID"
  | "ALLOCATION_IDENTITY_MISMATCH";

export type StrategicCampaignCheckpointReadinessV1 = Readonly<{
  contractVersion: typeof STRATEGIC_CAMPAIGN_CHECKPOINT_READINESS_VERSION_V1;
  evaluatedAt: string;
  checkpointId: string;
  campaignId: string;
  state: "READY_FOR_STEERING" | "VERIFY_REQUIRED";
  checkpoint: StrategicCampaignCheckpointEvidenceV1 | null;
  reasonCodes: readonly StrategicCampaignCheckpointReadinessReasonV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causality: "NOT_ESTABLISHED";
  confidence: null;
  monetaryValue: null;
  outcome: null;
  authority: Readonly<{
    steeringReviewPreparation: boolean;
    campaignMutation: false;
    allocationMutation: false;
    experimentMutation: false;
    budgetMutation: false;
    persistence: false;
    providerWrite: false;
    externalExecution: false;
    approvalBypass: false;
  }>;
}>;

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REFS = 100;
const REVIEW_SIGNALS = new Set<CampaignSteeringReviewSignalV1>([
  "NO_CHANGE_INDICATED",
  "ASSUMPTION_EVIDENCE_CONFLICT",
  "EXPERIMENT_RESULT_REQUIRES_REVIEW",
  "ALLOCATION_CONSTRAINT_CHANGED",
  "OBJECTIVE_EVIDENCE_CONFLICT",
  "INCONCLUSIVE"
]);
const MEASUREMENT_STATUSES = new Set<StrategicCampaignCheckpointEvidenceV1["measurementStatus"]>([
  "PARTIAL",
  "COMPLETE"
]);
const PROVENANCE_CLASSES = new Set<StrategicCampaignCheckpointEvidenceV1["provenance"]>([
  "FIRST_PARTY",
  "AUTHORIZED_CONNECTOR",
  "CANONICAL_MEMORY"
]);

const AUTHORITY = Object.freeze({
  steeringReviewPreparation: false,
  campaignMutation: false,
  allocationMutation: false,
  experimentMutation: false,
  budgetMutation: false,
  persistence: false,
  providerWrite: false,
  externalExecution: false,
  approvalBypass: false
} as const);

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) return null;
  return normalized;
}

function text(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

function refs(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const value of values) {
    const candidate = text(value);
    if (!candidate) return null;
    normalized.push(candidate);
  }
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function looksUnsafeReference(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("password=") ||
    normalized.includes("token=") ||
    normalized.includes("api_key=") ||
    normalized.includes("apikey=") ||
    normalized.includes("secret=") ||
    normalized.includes("authorization:") ||
    normalized.includes("bearer ")
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function normalizedOptional(value: unknown): string | null {
  return text(value) ?? null;
}

/**
 * Fail-closed evidence gate for StrategicCampaignCheckpointEvidenceV1.
 *
 * The steering compiler intentionally accepts already-classified checkpoint signals. This
 * boundary prevents an ungrounded classification from entering that compiler by requiring
 * exact, current, KNOWN support for the campaign, signal, measurement state, provenance,
 * observation time and any experiment/allocation identity used by the signal.
 *
 * Passing this gate only authorizes internal steering-review preparation. It does not prove
 * causality, assign confidence or value, mutate a campaign, reallocate budget, execute an
 * experiment, persist state, or perform an external write.
 */
export function assessStrategicCampaignCheckpointReadinessV1(input: Readonly<{
  draft: StrategicCampaignCheckpointEvidenceV1;
  support: StrategicCampaignCheckpointSupportV1;
  evaluatedAt: string;
  maxAgeMs: number;
}>): StrategicCampaignCheckpointReadinessV1 {
  const evaluatedAt = canonicalTimestamp(input?.evaluatedAt);
  const draft = input?.draft;
  const support = input?.support;
  const checkpointId = text(draft?.checkpointId) ?? "";
  const campaignId = text(draft?.campaignId) ?? "";
  const sourceRef = text(draft?.sourceRef);
  const draftObservedAt = canonicalTimestamp(draft?.observedAt);
  const supportObservedAt = canonicalTimestamp(support?.observedAt);
  const supportCampaignId = text(support?.campaignId);
  const evidenceRefs = refs(support?.evidenceRefs);
  const sourceRefs = refs(support?.sourceRefs);
  const reasons: StrategicCampaignCheckpointReadinessReasonV1[] = [];

  if (
    !evaluatedAt ||
    !checkpointId ||
    !campaignId ||
    !sourceRef ||
    !draftObservedAt ||
    !supportObservedAt ||
    !supportCampaignId ||
    !REVIEW_SIGNALS.has(draft?.reviewSignal) ||
    !REVIEW_SIGNALS.has(support?.reviewSignal) ||
    !MEASUREMENT_STATUSES.has(draft?.measurementStatus) ||
    !MEASUREMENT_STATUSES.has(support?.measurementStatus) ||
    !PROVENANCE_CLASSES.has(draft?.provenance) ||
    !PROVENANCE_CLASSES.has(support?.provenance) ||
    !Number.isFinite(input?.maxAgeMs) ||
    input.maxAgeMs < 0 ||
    input.maxAgeMs > MAX_AGE_MS
  ) {
    reasons.push("INVALID_INPUT");
  }

  if (!evidenceRefs) reasons.push("MISSING_EVIDENCE_REFS");
  if (!sourceRefs) reasons.push("MISSING_SOURCE_REFS");

  if (support?.truthState !== "KNOWN") reasons.push("SUPPORT_NOT_KNOWN");
  if (supportCampaignId && campaignId && supportCampaignId !== campaignId) {
    reasons.push("CAMPAIGN_IDENTITY_MISMATCH");
  }
  if (draft?.reviewSignal && support?.reviewSignal && draft.reviewSignal !== support.reviewSignal) {
    reasons.push("SIGNAL_IDENTITY_MISMATCH");
  }
  if (
    draft?.measurementStatus &&
    support?.measurementStatus &&
    draft.measurementStatus !== support.measurementStatus
  ) {
    reasons.push("MEASUREMENT_STATUS_MISMATCH");
  }
  if (draft?.provenance && support?.provenance && draft.provenance !== support.provenance) {
    reasons.push("PROVENANCE_MISMATCH");
  }
  if (draftObservedAt && supportObservedAt && draftObservedAt !== supportObservedAt) {
    reasons.push("OBSERVED_AT_MISMATCH");
  }
  if (sourceRef && sourceRefs && !sourceRefs.includes(sourceRef)) {
    reasons.push("SOURCE_REF_NOT_SUPPORTED");
  }
  if (
    (sourceRef && looksUnsafeReference(sourceRef)) ||
    evidenceRefs?.some(looksUnsafeReference) ||
    sourceRefs?.some(looksUnsafeReference)
  ) {
    reasons.push("UNSAFE_REFERENCE");
  }

  const evaluatedAtMs = evaluatedAt ? Date.parse(evaluatedAt) : null;
  const observedAtMs = supportObservedAt ? Date.parse(supportObservedAt) : null;
  if (evaluatedAtMs !== null && observedAtMs !== null && observedAtMs > evaluatedAtMs) {
    reasons.push("FUTURE_EVIDENCE");
  } else if (
    evaluatedAtMs !== null &&
    observedAtMs !== null &&
    Number.isFinite(input?.maxAgeMs) &&
    input.maxAgeMs >= 0 &&
    evaluatedAtMs - observedAtMs > input.maxAgeMs
  ) {
    reasons.push("STALE_EVIDENCE");
  }

  const draftExperimentId = normalizedOptional(draft?.experimentId);
  const supportExperimentId = normalizedOptional(support?.experimentId);
  if (draft?.reviewSignal === "EXPERIMENT_RESULT_REQUIRES_REVIEW") {
    if (!draftExperimentId || !supportExperimentId) reasons.push("MISSING_EXPERIMENT_ID");
    else if (draftExperimentId !== supportExperimentId) {
      reasons.push("EXPERIMENT_IDENTITY_MISMATCH");
    }
  } else if (draftExperimentId !== supportExperimentId) {
    reasons.push("EXPERIMENT_IDENTITY_MISMATCH");
  }

  const draftAllocationId = normalizedOptional(draft?.allocationId);
  const supportAllocationId = normalizedOptional(support?.allocationId);
  if (draft?.reviewSignal === "ALLOCATION_CONSTRAINT_CHANGED") {
    if (!draftAllocationId || !supportAllocationId) reasons.push("MISSING_ALLOCATION_ID");
    else if (draftAllocationId !== supportAllocationId) {
      reasons.push("ALLOCATION_IDENTITY_MISMATCH");
    }
  } else if (draftAllocationId !== supportAllocationId) {
    reasons.push("ALLOCATION_IDENTITY_MISMATCH");
  }

  const reasonCodes = [...new Set(reasons)].sort((a, b) => a.localeCompare(b));
  const ready = reasonCodes.length === 0;
  const authority = {
    ...AUTHORITY,
    steeringReviewPreparation: ready
  } as const;

  return deepFreeze({
    contractVersion: STRATEGIC_CAMPAIGN_CHECKPOINT_READINESS_VERSION_V1,
    evaluatedAt: evaluatedAt ?? String(input?.evaluatedAt ?? ""),
    checkpointId,
    campaignId,
    state: ready ? "READY_FOR_STEERING" : "VERIFY_REQUIRED",
    checkpoint: ready
      ? {
          checkpointId,
          campaignId,
          observedAt: draftObservedAt!,
          sourceRef: sourceRef!,
          provenance: draft.provenance,
          measurementStatus: draft.measurementStatus,
          reviewSignal: draft.reviewSignal,
          decisionId: normalizedOptional(draft.decisionId),
          experimentId: draftExperimentId,
          allocationId: draftAllocationId
        }
      : null,
    reasonCodes,
    evidenceRefs: evidenceRefs ?? [],
    sourceRefs: sourceRefs ?? [],
    causality: "NOT_ESTABLISHED",
    confidence: null,
    monetaryValue: null,
    outcome: null,
    authority
  });
}

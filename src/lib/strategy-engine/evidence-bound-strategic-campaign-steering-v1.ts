import { createHash } from "node:crypto";

import {
  STRATEGIC_CAMPAIGN_CHECKPOINT_READINESS_VERSION_V1,
  type StrategicCampaignCheckpointReadinessV1
} from "./strategic-campaign-checkpoint-readiness-v1";
import {
  reviewStrategicCampaignSteeringV1,
  type StrategicCampaignSteeringInputV1,
  type StrategicCampaignSteeringResultV1
} from "./strategic-campaign-steering-v1";

export const EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_VERSION_V1 =
  "EvidenceBoundStrategicCampaignSteeringV1" as const;
export const EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_POLICY_VERSION_V1 =
  "evidence_bound_strategic_campaign_steering_v1.0.0" as const;

const MAX_CHECKPOINTS = 250;
const MAX_READINESS_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type EvidenceBoundStrategicCampaignSteeringStateV1 =
  | "READY"
  | "WAITING"
  | "VERIFY_SOURCE";

export type EvidenceBoundStrategicCampaignSteeringReasonV1 =
  | "NO_VERIFIED_CHECKPOINTS"
  | "INVALID_INPUT"
  | "CHECKPOINT_BOUND_EXCEEDED"
  | "READINESS_CONTRACT_INVALID"
  | "READINESS_NOT_READY"
  | "READINESS_AUTHORITY_WIDENED"
  | "READINESS_INTERPRETATION_WIDENED"
  | "READINESS_TIMESTAMP_INVALID"
  | "READINESS_FROM_FUTURE"
  | "READINESS_STALE"
  | "CAMPAIGN_IDENTITY_MISMATCH"
  | "CHECKPOINT_IDENTITY_MISMATCH"
  | "DUPLICATE_CHECKPOINT_ID"
  | "READINESS_PROVENANCE_MISSING"
  | "CHECKPOINT_SOURCE_NOT_SUPPORTED"
  | "STEERING_BLOCKED"
  | "STEERING_WAITING";

export type EvidenceBoundStrategicCampaignSteeringInputV1 = Readonly<{
  campaignId: string;
  objective: string;
  state: StrategicCampaignSteeringInputV1["state"];
  asOf: string;
  maxEvidenceAgeDays: number;
  maximumReadinessAgeMs: number;
  checkpointReadiness: readonly StrategicCampaignCheckpointReadinessV1[];
}>;

export type EvidenceBoundStrategicCampaignSteeringV1 = Readonly<{
  contractVersion: typeof EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_VERSION_V1;
  policyVersion: typeof EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_POLICY_VERSION_V1;
  reviewId: string;
  state: EvidenceBoundStrategicCampaignSteeringStateV1;
  campaignId: string;
  asOf: string | null;
  reasonCodes: readonly EvidenceBoundStrategicCampaignSteeringReasonV1[];
  steering: Readonly<StrategicCampaignSteeringResultV1> | null;
  acceptedCheckpointIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causality: "NOT_ESTABLISHED";
  confidence: null;
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    steeringReviewPreparation: boolean;
    campaignMutation: false;
    budgetMutation: false;
    allocationMutation: false;
    experimentMutation: false;
    persistence: false;
    providerWrite: false;
    externalExecution: false;
    approvalBypass: false;
  }>;
}>;

const LIMITATIONS = Object.freeze([
  "Only checkpoint evidence that has already passed the canonical readiness gate may enter this steering path; raw caller-classified signals are not accepted here.",
  "A READY result prepares an internal campaign steering review only. It does not prove that the campaign, experiment, objective, or allocation caused an observed change.",
  "No confidence, monetary value, outcome, priority, scale/stop instruction, budget change, allocation change, experiment mutation, persistence, provider write, or external execution is inferred or authorized.",
  "Conflicting or incomplete steering evidence preserves the underlying steering compiler's blocked or waiting posture rather than forcing a recommendation."
] as const);

const EXPECTED_READINESS_AUTHORITY = Object.freeze({
  steeringReviewPreparation: true,
  campaignMutation: false,
  allocationMutation: false,
  experimentMutation: false,
  budgetMutation: false,
  persistence: false,
  providerWrite: false,
  externalExecution: false,
  approvalBypass: false
});

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === normalized ? normalized : null;
}

function uniqueRefs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1_000) return null;
  const normalized: string[] = [];
  for (const item of value) {
    const ref = text(item);
    if (!ref) return null;
    normalized.push(ref);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(EXPECTED_READINESS_AUTHORITY).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) =>
      key === expectedKeys[index]
      && actual[key] === EXPECTED_READINESS_AUTHORITY[key as keyof typeof EXPECTED_READINESS_AUTHORITY]
    );
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function stableId(parts: readonly string[]): string {
  return `evidence-bound-campaign-steering:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function output(
  input: EvidenceBoundStrategicCampaignSteeringInputV1,
  asOf: string | null,
  state: EvidenceBoundStrategicCampaignSteeringStateV1,
  reasons: readonly EvidenceBoundStrategicCampaignSteeringReasonV1[],
  steering: StrategicCampaignSteeringResultV1 | null,
  checkpointIds: readonly string[],
  evidenceRefs: readonly string[],
  sourceRefs: readonly string[]
): EvidenceBoundStrategicCampaignSteeringV1 {
  const normalizedReasons = [...new Set(reasons)].sort((a, b) => a.localeCompare(b)) as EvidenceBoundStrategicCampaignSteeringReasonV1[];
  const acceptedCheckpointIds = [...new Set(checkpointIds)].sort((a, b) => a.localeCompare(b));
  const normalizedEvidenceRefs = [...new Set(evidenceRefs)].sort((a, b) => a.localeCompare(b));
  const normalizedSourceRefs = [...new Set(sourceRefs)].sort((a, b) => a.localeCompare(b));
  return deepFreeze({
    contractVersion: EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_VERSION_V1,
    policyVersion: EVIDENCE_BOUND_STRATEGIC_CAMPAIGN_STEERING_POLICY_VERSION_V1,
    reviewId: stableId([
      text(input?.campaignId) ?? "<invalid>",
      asOf ?? "<invalid>",
      acceptedCheckpointIds.join("|"),
      normalizedReasons.join("|")
    ]),
    state,
    campaignId: text(input?.campaignId) ?? "",
    asOf,
    reasonCodes: Object.freeze(normalizedReasons),
    steering,
    acceptedCheckpointIds: Object.freeze(acceptedCheckpointIds),
    evidenceRefs: Object.freeze(normalizedEvidenceRefs),
    sourceRefs: Object.freeze(normalizedSourceRefs),
    causality: "NOT_ESTABLISHED",
    confidence: null,
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: Object.freeze({
      analysisOnly: true as const,
      steeringReviewPreparation: state === "READY" && steering?.authority.reviewPreparation === true,
      campaignMutation: false as const,
      budgetMutation: false as const,
      allocationMutation: false as const,
      experimentMutation: false as const,
      persistence: false as const,
      providerWrite: false as const,
      externalExecution: false as const,
      approvalBypass: false as const
    })
  });
}

/**
 * Closes the readiness-to-steering seam. The raw steering compiler accepts
 * already-classified checkpoints by design; this path accepts only checkpoints
 * that passed the canonical evidence readiness contract and preserves its
 * analysis-only authority before invoking campaign steering review.
 */
export function reviewEvidenceBoundStrategicCampaignSteeringV1(
  input: EvidenceBoundStrategicCampaignSteeringInputV1
): EvidenceBoundStrategicCampaignSteeringV1 {
  const campaignId = text(input?.campaignId);
  const objective = text(input?.objective);
  const asOf = canonicalTimestamp(input?.asOf);
  const asOfMs = asOf ? Date.parse(asOf) : null;
  const maximumReadinessAgeMs = input?.maximumReadinessAgeMs;
  const checkpoints = input?.checkpointReadiness;
  const reasons: EvidenceBoundStrategicCampaignSteeringReasonV1[] = [];

  if (
    !campaignId
    || !objective
    || !asOf
    || !Number.isFinite(input?.maxEvidenceAgeDays)
    || input.maxEvidenceAgeDays <= 0
    || !Number.isFinite(maximumReadinessAgeMs)
    || maximumReadinessAgeMs <= 0
    || maximumReadinessAgeMs > MAX_READINESS_AGE_MS
    || !Array.isArray(checkpoints)
  ) {
    reasons.push("INVALID_INPUT");
  }

  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return output(input, asOf, reasons.length > 0 ? "VERIFY_SOURCE" : "WAITING", [...reasons, "NO_VERIFIED_CHECKPOINTS"], null, [], [], []);
  }
  if (checkpoints.length > MAX_CHECKPOINTS) reasons.push("CHECKPOINT_BOUND_EXCEEDED");

  const accepted = [] as NonNullable<StrategicCampaignCheckpointReadinessV1["checkpoint"]>[];
  const checkpointIds: string[] = [];
  const evidenceRefs: string[] = [];
  const sourceRefs: string[] = [];
  const seenCheckpointIds = new Set<string>();

  for (const readiness of checkpoints.slice(0, MAX_CHECKPOINTS)) {
    if (readiness?.contractVersion !== STRATEGIC_CAMPAIGN_CHECKPOINT_READINESS_VERSION_V1) {
      reasons.push("READINESS_CONTRACT_INVALID");
      continue;
    }
    if (readiness.state !== "READY_FOR_STEERING" || !readiness.checkpoint) {
      reasons.push("READINESS_NOT_READY");
      continue;
    }
    if (!exactAuthority(readiness.authority)) reasons.push("READINESS_AUTHORITY_WIDENED");
    if (
      readiness.causality !== "NOT_ESTABLISHED"
      || readiness.confidence !== null
      || readiness.monetaryValue !== null
      || readiness.outcome !== null
    ) {
      reasons.push("READINESS_INTERPRETATION_WIDENED");
    }

    const readinessAt = canonicalTimestamp(readiness.evaluatedAt);
    if (!readinessAt) {
      reasons.push("READINESS_TIMESTAMP_INVALID");
    } else if (asOfMs !== null) {
      const ageMs = asOfMs - Date.parse(readinessAt);
      if (ageMs < 0) reasons.push("READINESS_FROM_FUTURE");
      else if (Number.isFinite(maximumReadinessAgeMs) && ageMs > maximumReadinessAgeMs) {
        reasons.push("READINESS_STALE");
      }
    }

    const readinessCampaignId = text(readiness.campaignId);
    const checkpointCampaignId = text(readiness.checkpoint.campaignId);
    const readinessCheckpointId = text(readiness.checkpointId);
    const checkpointId = text(readiness.checkpoint.checkpointId);
    if (
      !campaignId
      || readinessCampaignId !== campaignId
      || checkpointCampaignId !== campaignId
    ) {
      reasons.push("CAMPAIGN_IDENTITY_MISMATCH");
    }
    if (!readinessCheckpointId || !checkpointId || readinessCheckpointId !== checkpointId) {
      reasons.push("CHECKPOINT_IDENTITY_MISMATCH");
    } else if (seenCheckpointIds.has(checkpointId)) {
      reasons.push("DUPLICATE_CHECKPOINT_ID");
    } else {
      seenCheckpointIds.add(checkpointId);
      checkpointIds.push(checkpointId);
    }

    const readinessEvidenceRefs = uniqueRefs(readiness.evidenceRefs);
    const readinessSourceRefs = uniqueRefs(readiness.sourceRefs);
    if (!readinessEvidenceRefs || !readinessSourceRefs) {
      reasons.push("READINESS_PROVENANCE_MISSING");
    } else {
      evidenceRefs.push(...readinessEvidenceRefs);
      sourceRefs.push(...readinessSourceRefs);
      if (!readinessSourceRefs.includes(readiness.checkpoint.sourceRef)) {
        reasons.push("CHECKPOINT_SOURCE_NOT_SUPPORTED");
      }
    }

    accepted.push(readiness.checkpoint);
  }

  if (reasons.length > 0) {
    return output(input, asOf, "VERIFY_SOURCE", reasons, null, checkpointIds, evidenceRefs, sourceRefs);
  }

  const steering = reviewStrategicCampaignSteeringV1({
    campaignId: campaignId!,
    objective: objective!,
    state: input.state,
    asOf: asOf!,
    maxEvidenceAgeDays: input.maxEvidenceAgeDays,
    checkpoints: accepted
  });

  if (steering.status === "BLOCKED") {
    return output(input, asOf, "VERIFY_SOURCE", ["STEERING_BLOCKED"], steering, checkpointIds, evidenceRefs, sourceRefs);
  }
  if (steering.status === "WAITING") {
    return output(input, asOf, "WAITING", ["STEERING_WAITING"], steering, checkpointIds, evidenceRefs, sourceRefs);
  }
  return output(input, asOf, "READY", [], steering, checkpointIds, evidenceRefs, sourceRefs);
}

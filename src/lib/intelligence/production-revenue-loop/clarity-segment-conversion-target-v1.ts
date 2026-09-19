import {
  buildClaritySegmentFrictionV1,
  type ClaritySegmentFrictionEntryV1,
  type ClaritySegmentFrictionInputV1,
  type ClaritySegmentFrictionResultV1,
} from "@/lib/clarity-behavior/segment-friction-v1";
import type { BehavioralFreshnessCorroborationV1 } from "./behavioral-freshness-corroboration-v1";
import type { ConversionFrictionReadinessV1 } from "./conversion-friction-readiness-v1";

export const CLARITY_SEGMENT_CONVERSION_TARGET_VERSION =
  "CLARITY_SEGMENT_CONVERSION_TARGET_V1" as const;

const MAX_CANDIDATES = 5;

export type ClaritySegmentConversionTargetStatusV1 =
  | "READY_FOR_TARGET_REVIEW"
  | "NO_MATERIAL_SEGMENT"
  | "BLOCKED";

export type ClaritySegmentConversionTargetReasonV1 =
  | "FRESH_SEGMENT_TARGETS_READY"
  | "NO_MATERIAL_SEGMENT_FRICTION"
  | "FRESH_BEHAVIORAL_CORROBORATION_REQUIRED"
  | "CONVERSION_TEST_READINESS_REQUIRED"
  | "CLARITY_NOT_USED_BY_HYPOTHESIS"
  | "AUTHORITY_INTEGRITY_FAILURE"
  | "SEGMENT_DECISION_TIME_MISMATCH"
  | "SEGMENT_SOURCE_SNAPSHOT_MISMATCH"
  | "SEGMENT_RANGE_MISMATCH"
  | "SEGMENT_EVIDENCE_NOT_READY";

export type ClaritySegmentConversionTargetCandidateV1 = Readonly<{
  rank: number;
  dimension: ClaritySegmentFrictionEntryV1["dimension"];
  segmentRef: string;
  label: string;
  severity: "CRITICAL" | "HIGH";
  currentSessions: number;
  priorSessions: number;
  observedDeadClickRate: number | null;
  observedQuickBackRate: number | null;
  facts: readonly string[];
  evidenceRefs: readonly string[];
  interpretation: "OBSERVED_FRICTION_ONLY";
}>;

export type ClaritySegmentConversionTargetInputV1 = Readonly<{
  freshBehavioral: BehavioralFreshnessCorroborationV1;
  readiness: ConversionFrictionReadinessV1;
  segmentInput: ClaritySegmentFrictionInputV1;
}>;

export type ClaritySegmentConversionTargetV1 = Readonly<{
  version: typeof CLARITY_SEGMENT_CONVERSION_TARGET_VERSION;
  status: ClaritySegmentConversionTargetStatusV1;
  reasonCode: ClaritySegmentConversionTargetReasonV1;
  recommendationId: string;
  evaluatedAt: string;
  currentRange: Readonly<{ startDate: string; endDate: string }>;
  comparisonRange: Readonly<{ startDate: string; endDate: string }>;
  segmentEvidenceState: ClaritySegmentFrictionResultV1["state"] | "NOT_EVALUATED";
  primaryTarget: ClaritySegmentConversionTargetCandidateV1 | null;
  alternateTargets: readonly ClaritySegmentConversionTargetCandidateV1[];
  measurementRequirements: {
    sameSegmentIdentityRequiredPostPeriod: true;
    freshClarityPostPeriodRequired: true;
    exactWindowBindingRequired: true;
    wooCommercialOutcomeStillRequired: true;
  };
  limitations: readonly string[];
  authority: {
    siteMutationAllowed: false;
    checkoutMutationAllowed: false;
    pricingMutationAllowed: false;
    paidMediaMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
    causalClaimAllowed: false;
    revenueAttributionAllowed: false;
  };
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function sameRange(
  left: { startDate: string; endDate: string } | null | undefined,
  right: { startDate: string; endDate: string } | null | undefined,
): boolean {
  return Boolean(
    left
      && right
      && left.startDate === right.startDate
      && left.endDate === right.endDate,
  );
}

function authority(): ClaritySegmentConversionTargetV1["authority"] {
  return {
    siteMutationAllowed: false,
    checkoutMutationAllowed: false,
    pricingMutationAllowed: false,
    paidMediaMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
    causalClaimAllowed: false,
    revenueAttributionAllowed: false,
  };
}

function finalize(
  input: ClaritySegmentConversionTargetInputV1,
  status: ClaritySegmentConversionTargetStatusV1,
  reasonCode: ClaritySegmentConversionTargetReasonV1,
  segmentEvidenceState: ClaritySegmentConversionTargetV1["segmentEvidenceState"],
  candidates: readonly ClaritySegmentConversionTargetCandidateV1[],
  limitations: readonly string[],
): ClaritySegmentConversionTargetV1 {
  const accepted = input.freshBehavioral.acceptedCorroboration;
  const currentRange = accepted?.decision.currentRange ?? input.segmentInput.currentRange;
  const comparisonRange = accepted?.decision.comparisonRange ?? input.segmentInput.priorRange;
  return deepFreeze({
    version: CLARITY_SEGMENT_CONVERSION_TARGET_VERSION,
    status,
    reasonCode,
    recommendationId: input.readiness.recommendationId,
    evaluatedAt: input.freshBehavioral.evaluatedAt,
    currentRange: { ...currentRange },
    comparisonRange: { ...comparisonRange },
    segmentEvidenceState,
    primaryTarget: candidates[0] ?? null,
    alternateTargets: candidates.slice(1, MAX_CANDIDATES),
    measurementRequirements: {
      sameSegmentIdentityRequiredPostPeriod: true,
      freshClarityPostPeriodRequired: true,
      exactWindowBindingRequired: true,
      wooCommercialOutcomeStillRequired: true,
    },
    limitations: [...new Set(limitations)],
    authority: authority(),
  });
}

function hasSafeAuthority(input: ClaritySegmentConversionTargetInputV1): boolean {
  const fresh = input.freshBehavioral;
  const readiness = input.readiness;
  return fresh.externalMutationAllowed === false
    && fresh.metaWriteAllowed === false
    && fresh.approvalBypassAllowed === false
    && fresh.causalClaim === false
    && fresh.revenueAttributionClaim === false
    && fresh.expectedLift === null
    && fresh.confidence === null
    && fresh.monetaryValue === null
    && readiness.nextStep.externalMutationAllowed === false
    && readiness.nextStep.metaWriteAllowed === false
    && readiness.causalClaim === false
    && readiness.revenueAttributionClaim === false
    && readiness.expectedLift === null
    && readiness.monetaryValue === null;
}

function candidateFromEntry(
  entry: ClaritySegmentFrictionEntryV1,
): ClaritySegmentConversionTargetCandidateV1 | null {
  if (
    entry.sampleState !== "SUFFICIENT"
    || (entry.severity !== "CRITICAL" && entry.severity !== "HIGH")
    || entry.evidenceRefs.length === 0
  ) {
    return null;
  }
  return {
    rank: entry.rank,
    dimension: entry.dimension,
    segmentRef: entry.segmentRef,
    label: entry.label,
    severity: entry.severity,
    currentSessions: entry.currentSessions,
    priorSessions: entry.priorSessions,
    observedDeadClickRate: entry.deadClickRate.current,
    observedQuickBackRate: entry.quickBackRate.current,
    facts: [...entry.facts],
    evidenceRefs: [...entry.evidenceRefs],
    interpretation: "OBSERVED_FRICTION_ONLY",
  };
}

/**
 * Binds fresh, complete Clarity segment evidence to an already governed
 * conversion-friction recommendation so experiment preparation can review the
 * most affected evidenced segments instead of guessing a page/device/browser/
 * source target from aggregate behavior.
 *
 * The segment export must be from the exact Clarity snapshot and decision
 * instant already accepted by the closed revenue/behavior loop. A target is an
 * investigation/test-review candidate only. It does not establish mechanism,
 * conversion causality, revenue attribution, expected lift, or action authority.
 */
export function buildClaritySegmentConversionTargetV1(
  input: ClaritySegmentConversionTargetInputV1,
): ClaritySegmentConversionTargetV1 {
  const fresh = input.freshBehavioral;
  const accepted = fresh.acceptedCorroboration;
  const acceptedClarity = fresh.clarityFreshness.acceptedClarity;

  if (
    fresh.status !== "READY"
    || fresh.clarityFreshness.status !== "READY"
    || fresh.checkoutFreshness.status !== "READY"
    || !accepted
    || !acceptedClarity
    || accepted.state !== "SUPPORTED_FOR_INVESTIGATION"
    || accepted.decision.revenueDriver !== "CONVERSION"
  ) {
    return finalize(
      input,
      "BLOCKED",
      "FRESH_BEHAVIORAL_CORROBORATION_REQUIRED",
      "NOT_EVALUATED",
      [],
      [
        "Fresh, complete Clarity and checkout evidence must already support the canonical conversion investigation before segment targeting is reviewed.",
      ],
    );
  }

  if (
    input.readiness.status !== "READY_TO_PREPARE_TEST"
    || input.readiness.nextStep.kind !== "PREPARE_BOUNDED_CONVERSION_TEST"
    || input.readiness.nextStep.approvalClass !== "KEEGAN_APPROVAL_REQUIRED"
    || input.readiness.recommendationId !== accepted.decision.recommendationId
  ) {
    return finalize(
      input,
      "BLOCKED",
      "CONVERSION_TEST_READINESS_REQUIRED",
      "NOT_EVALUATED",
      [],
      [
        "Segment targeting cannot outrun the canonical conversion-test readiness gate or bind to a different recommendation.",
      ],
    );
  }

  if (!input.readiness.evidenceBasis.clarityUsed) {
    return finalize(
      input,
      "BLOCKED",
      "CLARITY_NOT_USED_BY_HYPOTHESIS",
      "NOT_EVALUATED",
      [],
      [
        "Clarity segments cannot be promoted into the test hypothesis when Clarity was not part of the governed pre-test evidence basis.",
      ],
    );
  }

  if (!hasSafeAuthority(input)) {
    return finalize(
      input,
      "BLOCKED",
      "AUTHORITY_INTEGRITY_FAILURE",
      "NOT_EVALUATED",
      [],
      [
        "Upstream conversion intelligence widened action, attribution, confidence, lift, or monetary authority and therefore fails closed.",
      ],
    );
  }

  if (input.segmentInput.evaluatedAt !== fresh.evaluatedAt) {
    return finalize(
      input,
      "BLOCKED",
      "SEGMENT_DECISION_TIME_MISMATCH",
      "NOT_EVALUATED",
      [],
      [
        "Clarity segment evidence must be evaluated at the exact revenue-decision instant used by the fresh behavioral corroboration.",
      ],
    );
  }

  if (
    input.segmentInput.extractedAt !== acceptedClarity.extractedAt
    || input.segmentInput.completeThrough !== acceptedClarity.completeThrough
  ) {
    return finalize(
      input,
      "BLOCKED",
      "SEGMENT_SOURCE_SNAPSHOT_MISMATCH",
      "NOT_EVALUATED",
      [],
      [
        "Clarity aggregate and segment evidence must come from the same accepted extraction snapshot and completeness boundary before they can be combined.",
      ],
    );
  }

  if (
    !sameRange(input.segmentInput.currentRange, accepted.decision.currentRange)
    || !sameRange(input.segmentInput.priorRange, accepted.decision.comparisonRange)
    || !sameRange(input.segmentInput.currentRange, acceptedClarity.currentRange)
    || !sameRange(input.segmentInput.priorRange, acceptedClarity.priorRange)
  ) {
    return finalize(
      input,
      "BLOCKED",
      "SEGMENT_RANGE_MISMATCH",
      "NOT_EVALUATED",
      [],
      [
        "Clarity segment evidence must use the exact canonical current and comparison windows already accepted by the revenue/behavior decision loop.",
      ],
    );
  }

  const segmentResult = buildClaritySegmentFrictionV1(input.segmentInput);
  if (
    segmentResult.state !== "READY"
    || segmentResult.authority.externalMutationAllowed !== false
    || segmentResult.authority.metaWriteAllowed !== false
    || segmentResult.authority.causalClaimAllowed !== false
    || segmentResult.authority.revenueAttributionAllowed !== false
  ) {
    return finalize(
      input,
      "BLOCKED",
      "SEGMENT_EVIDENCE_NOT_READY",
      segmentResult.state,
      [],
      [
        ...segmentResult.limitations,
        "Withheld, partial, stale, conflicted, future, or authority-widened segment evidence cannot select a conversion-test target.",
      ],
    );
  }

  const candidates = segmentResult.leaderboard
    .map(candidateFromEntry)
    .filter((candidate): candidate is ClaritySegmentConversionTargetCandidateV1 => candidate !== null)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    return finalize(
      input,
      "NO_MATERIAL_SEGMENT",
      "NO_MATERIAL_SEGMENT_FRICTION",
      segmentResult.state,
      [],
      [
        ...segmentResult.limitations,
        "Aggregate conversion friction remains a hypothesis, but no sufficiently sampled Clarity segment crossed the existing material-friction thresholds. Do not invent a segment target.",
      ],
    );
  }

  return finalize(
    input,
    "READY_FOR_TARGET_REVIEW",
    "FRESH_SEGMENT_TARGETS_READY",
    segmentResult.state,
    candidates,
    [
      ...segmentResult.limitations,
      "Candidate order reflects observed Clarity friction only. It does not rank expected conversion lift or revenue impact.",
      "Any production test still requires the existing Keegan approval boundary and preregistered measurement plan.",
    ],
  );
}

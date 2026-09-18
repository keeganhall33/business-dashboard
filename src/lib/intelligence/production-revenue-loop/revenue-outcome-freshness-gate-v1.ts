import {
  compileRevenueOutcomeLearningCandidateV1,
  type RevenueOutcomeLearningCandidateV1,
} from "./revenue-outcome-learning-candidate-v1";
import type {
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeObservationV1,
  RevenueOutcomeSourceV1,
} from "./revenue-outcome-evaluation-v1";

export const REVENUE_OUTCOME_FRESHNESS_GATE_VERSION =
  "REVENUE_OUTCOME_FRESHNESS_GATE_V1" as const;

export type RevenueOutcomeFreshnessReasonV1 =
  | "LEARNING_REVIEW_READY"
  | "UPSTREAM_LEARNING_BLOCKED"
  | "INVALID_EVALUATION_TIMESTAMP"
  | "INVALID_FRESHNESS_POLICY"
  | "MISSING_SOURCE_FRESHNESS_POLICY"
  | "INVALID_SOURCE_OBSERVATION_TIMESTAMP"
  | "FUTURE_SOURCE_OBSERVATION"
  | "STALE_SOURCE_OBSERVATION"
  | "MISSING_COMPLETE_THROUGH"
  | "INVALID_COMPLETE_THROUGH"
  | "INCOMPLETE_SOURCE_RANGE"
  | "OBSERVATION_PRECEDES_COMPLETE_DAY"
  | "CONFOUNDER_NOT_CURRENT"
  | "INVALID_CONFOUNDER_TIMESTAMP"
  | "FUTURE_CONFOUNDER"
  | "STALE_CONFOUNDER";

export interface RevenueOutcomeFreshnessPolicyV1 {
  maxObservationAgeMsBySource: Partial<Record<RevenueOutcomeSourceV1, number>>;
  maxConfounderAgeMs?: number | null;
}

export interface RevenueOutcomeSourceFreshnessCheckV1 {
  source: RevenueOutcomeSourceV1;
  observationCount: number;
  maxAgeMs: number | null;
  oldestObservedAt: string | null;
  newestObservedAt: string | null;
  status: "FRESH" | "BLOCKED";
}

export interface RevenueOutcomeFreshnessGateV1 {
  version: typeof REVENUE_OUTCOME_FRESHNESS_GATE_VERSION;
  status: "ELIGIBLE_FOR_REVIEW" | "BLOCKED";
  reasonCodes: readonly RevenueOutcomeFreshnessReasonV1[];
  decisionRef: string;
  implementationRef: string;
  evaluatedAt: string;
  sourceChecks: readonly Readonly<RevenueOutcomeSourceFreshnessCheckV1>[];
  acceptedCandidate: RevenueOutcomeLearningCandidateV1 | null;
  attribution: {
    causal: "NOT_ESTABLISHED";
    channel: "NOT_ESTABLISHED";
  };
  limitations: readonly string[];
  authority: {
    durableLearningPromotionAllowed: false;
    reallocationAllowed: false;
    causalClaimAllowed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}

const SOURCES: readonly RevenueOutcomeSourceV1[] = [
  "WOO",
  "GA4",
  "META",
  "CLARITY",
  "FUNNELKIT",
];
const DAY_MS = 24 * 60 * 60 * 1000;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function strictInstantMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function dateOnlyMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().slice(0, 10) === value ? milliseconds : null;
}

function validAge(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function observations(input: RevenueOutcomeEvaluationInputV1): RevenueOutcomeObservationV1[] {
  if (!Array.isArray(input?.baseline) || !Array.isArray(input?.outcome)) return [];
  return [...input.baseline, ...input.outcome];
}

function sourceChecks(
  allObservations: RevenueOutcomeObservationV1[],
  policy: RevenueOutcomeFreshnessPolicyV1,
  blockedSources: Set<RevenueOutcomeSourceV1>,
): RevenueOutcomeSourceFreshnessCheckV1[] {
  return SOURCES.filter((source) => allObservations.some((item) => item?.source === source))
    .map((source) => {
      const sourceObservations = allObservations.filter((item) => item?.source === source);
      const timestamps = sourceObservations
        .map((item) => item?.observedAt)
        .filter((value): value is string => typeof value === "string")
        .sort();
      const maxAge = policy?.maxObservationAgeMsBySource?.[source];
      return {
        source,
        observationCount: sourceObservations.length,
        maxAgeMs: validAge(maxAge) ? maxAge : null,
        oldestObservedAt: timestamps[0] ?? null,
        newestObservedAt: timestamps.at(-1) ?? null,
        status: blockedSources.has(source) ? "BLOCKED" : "FRESH",
      };
    });
}

function authority(): RevenueOutcomeFreshnessGateV1["authority"] {
  return {
    durableLearningPromotionAllowed: false,
    reallocationAllowed: false,
    causalClaimAllowed: false,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function result(
  input: RevenueOutcomeEvaluationInputV1,
  allObservations: RevenueOutcomeObservationV1[],
  policy: RevenueOutcomeFreshnessPolicyV1,
  reasonCodes: RevenueOutcomeFreshnessReasonV1[],
  blockedSources: Set<RevenueOutcomeSourceV1>,
  acceptedCandidate: RevenueOutcomeLearningCandidateV1 | null,
): RevenueOutcomeFreshnessGateV1 {
  const blocked = reasonCodes.some((reason) => reason !== "LEARNING_REVIEW_READY");
  return deepFreeze({
    version: REVENUE_OUTCOME_FRESHNESS_GATE_VERSION,
    status: blocked ? "BLOCKED" : "ELIGIBLE_FOR_REVIEW",
    reasonCodes: [...new Set(reasonCodes)],
    decisionRef: input?.decisionRef ?? "UNKNOWN",
    implementationRef: input?.implementationRef ?? "UNKNOWN",
    evaluatedAt: input?.evaluatedAt ?? "UNKNOWN",
    sourceChecks: sourceChecks(allObservations, policy, blockedSources),
    acceptedCandidate: blocked ? null : acceptedCandidate,
    attribution: {
      causal: "NOT_ESTABLISHED",
      channel: "NOT_ESTABLISHED",
    },
    limitations: blocked
      ? [
          "Stale, incomplete, future-dated, or otherwise non-current outcome evidence cannot be promoted into governed learning review.",
          "Outcome freshness and completeness do not establish that an implementation caused an observed change or that any channel deserves attribution.",
        ]
      : [
          "Fresh, complete observations support governed observational review only; they do not establish causality, channel attribution, expected lift, monetary value, or future performance.",
        ],
    authority: authority(),
  });
}

/**
 * Revalidates retrieval freshness and date-range completeness immediately before
 * a measured revenue outcome can enter governed observational learning review.
 *
 * Historical baseline periods are allowed, but the evidence used to measure
 * them must itself have been retrieved recently under an explicit caller-owned
 * source policy. A CURRENT truth label is never allowed to substitute for
 * freshness or complete-through evidence.
 */
export function compileFreshRevenueOutcomeLearningCandidateV1(
  input: RevenueOutcomeEvaluationInputV1,
  policy: RevenueOutcomeFreshnessPolicyV1,
): RevenueOutcomeFreshnessGateV1 {
  const allObservations = observations(input);
  const reasons: RevenueOutcomeFreshnessReasonV1[] = [];
  const blockedSources = new Set<RevenueOutcomeSourceV1>();
  const evaluatedAtMs = strictInstantMs(input?.evaluatedAt);

  if (evaluatedAtMs === null) reasons.push("INVALID_EVALUATION_TIMESTAMP");
  if (!policy || !policy.maxObservationAgeMsBySource || typeof policy.maxObservationAgeMsBySource !== "object") {
    reasons.push("INVALID_FRESHNESS_POLICY");
  }

  for (const observation of allObservations) {
    if (!SOURCES.includes(observation?.source)) continue;
    const maxAgeMs = policy?.maxObservationAgeMsBySource?.[observation.source];
    if (!validAge(maxAgeMs)) {
      reasons.push("MISSING_SOURCE_FRESHNESS_POLICY");
      blockedSources.add(observation.source);
    }

    const observedAtMs = strictInstantMs(observation?.observedAt);
    if (observedAtMs === null) {
      reasons.push("INVALID_SOURCE_OBSERVATION_TIMESTAMP");
      blockedSources.add(observation.source);
    } else if (evaluatedAtMs !== null) {
      if (observedAtMs > evaluatedAtMs) {
        reasons.push("FUTURE_SOURCE_OBSERVATION");
        blockedSources.add(observation.source);
      } else if (validAge(maxAgeMs) && evaluatedAtMs - observedAtMs > maxAgeMs) {
        reasons.push("STALE_SOURCE_OBSERVATION");
        blockedSources.add(observation.source);
      }
    }

    if (observation?.completeThrough === null || observation?.completeThrough === undefined) {
      reasons.push("MISSING_COMPLETE_THROUGH");
      blockedSources.add(observation.source);
      continue;
    }

    const completeThroughMs = dateOnlyMs(observation.completeThrough);
    const rangeEndMs = dateOnlyMs(observation?.range?.endDate);
    if (completeThroughMs === null || rangeEndMs === null) {
      reasons.push("INVALID_COMPLETE_THROUGH");
      blockedSources.add(observation.source);
      continue;
    }
    if (completeThroughMs < rangeEndMs) {
      reasons.push("INCOMPLETE_SOURCE_RANGE");
      blockedSources.add(observation.source);
    }
    if (observedAtMs !== null && observedAtMs < completeThroughMs + DAY_MS) {
      reasons.push("OBSERVATION_PRECEDES_COMPLETE_DAY");
      blockedSources.add(observation.source);
    }
  }

  const confounders = Array.isArray(input?.confounders) ? input.confounders : [];
  if (confounders.length > 0 && !validAge(policy?.maxConfounderAgeMs)) {
    reasons.push("INVALID_FRESHNESS_POLICY");
  }
  for (const confounder of confounders) {
    if (confounder?.truthState !== "CURRENT") reasons.push("CONFOUNDER_NOT_CURRENT");
    const observedAtMs = strictInstantMs(confounder?.observedAt);
    if (observedAtMs === null) {
      reasons.push("INVALID_CONFOUNDER_TIMESTAMP");
      continue;
    }
    if (evaluatedAtMs !== null && observedAtMs > evaluatedAtMs) {
      reasons.push("FUTURE_CONFOUNDER");
    } else if (
      evaluatedAtMs !== null
      && validAge(policy?.maxConfounderAgeMs)
      && evaluatedAtMs - observedAtMs > policy.maxConfounderAgeMs
    ) {
      reasons.push("STALE_CONFOUNDER");
    }
  }

  if (reasons.length > 0) {
    return result(input, allObservations, policy, reasons, blockedSources, null);
  }

  const candidate = compileRevenueOutcomeLearningCandidateV1(input);
  if (candidate.status !== "ELIGIBLE_FOR_REVIEW") {
    return result(
      input,
      allObservations,
      policy,
      ["UPSTREAM_LEARNING_BLOCKED"],
      blockedSources,
      null,
    );
  }

  return result(
    input,
    allObservations,
    policy,
    ["LEARNING_REVIEW_READY"],
    blockedSources,
    candidate,
  );
}

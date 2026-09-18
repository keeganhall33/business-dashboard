import {
  buildRevenueDecisionPacketV1,
  type RevenueDecisionPacketInputV1,
  type RevenueSourceV1,
  type RevenueTruthStateV1,
} from "./decision-packet-v1";

export const REVENUE_SOURCE_FRESHNESS_REVALIDATION_VERSION =
  "REVENUE_SOURCE_FRESHNESS_REVALIDATION_V1" as const;

export type RevenueSourceFreshnessPolicyV1 = Record<RevenueSourceV1, number>;

export type RevenueSourceFreshnessStatusV1 = {
  source: RevenueSourceV1;
  inputTruthState: RevenueTruthStateV1;
  decisionTruthState: RevenueTruthStateV1;
  observedAt: string;
  ageHours: number | null;
  maxAgeHours: number;
};

export type RevenueSourceFreshnessRevalidationV1 = {
  version: typeof REVENUE_SOURCE_FRESHNESS_REVALIDATION_VERSION;
  status: "READY" | "NOT_READY" | "CONFLICTED";
  reasonCode:
    | "ALL_SOURCES_CURRENT"
    | "SOURCE_EVIDENCE_NOT_CURRENT"
    | "INVALID_FRESHNESS_POLICY"
    | "INVALID_REVENUE_INPUT"
    | "INVALID_EVALUATION_TIME"
    | "FUTURE_PACKET_GENERATION"
    | "INVALID_SOURCE_TIMESTAMP"
    | "FUTURE_SOURCE_OBSERVATION";
  evaluatedAt: string;
  sourceStatus: readonly RevenueSourceFreshnessStatusV1[];
  acceptedInput: RevenueDecisionPacketInputV1 | null;
  limitations: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  expectedLift: null;
  monetaryValue: null;
  externalMutationAllowed: false;
  metaWriteAllowed: false;
  approvalBypassAllowed: false;
};

const SOURCES: readonly RevenueSourceV1[] = ["WOO", "GA4", "META"];
const HOUR_MS = 60 * 60 * 1000;
const ISO_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString().slice(0, 10) === value;
}

function validIsoInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match || !validCalendarDate(match[1])) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function validPolicy(policy: RevenueSourceFreshnessPolicyV1): boolean {
  return SOURCES.every((source) => {
    const hours = policy?.[source];
    return typeof hours === "number" && Number.isFinite(hours) && hours > 0;
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function finalize(
  status: RevenueSourceFreshnessRevalidationV1["status"],
  reasonCode: RevenueSourceFreshnessRevalidationV1["reasonCode"],
  evaluatedAt: string,
  sourceStatus: RevenueSourceFreshnessStatusV1[],
  acceptedInput: RevenueDecisionPacketInputV1 | null,
  limitations: string[],
): RevenueSourceFreshnessRevalidationV1 {
  return deepFreeze({
    version: REVENUE_SOURCE_FRESHNESS_REVALIDATION_VERSION,
    status,
    reasonCode,
    evaluatedAt,
    sourceStatus,
    acceptedInput,
    limitations,
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    monetaryValue: null,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    approvalBypassAllowed: false,
  });
}

/**
 * Revalidates canonical Woo, GA4, and Meta observations at the instant a new
 * revenue decision is requested. Upstream CURRENT truth is not permanent: an
 * observation that exceeds the caller-declared source freshness policy becomes
 * STALE for this decision and is withheld from the accepted decision input.
 *
 * This gate never upgrades PARTIAL, STALE, UNKNOWN, or CONFLICTED evidence and
 * grants no consequential business or provider-write authority.
 */
export function revalidateRevenueSourceFreshnessV1(
  input: RevenueDecisionPacketInputV1,
  evaluatedAt: string,
  policy: RevenueSourceFreshnessPolicyV1,
): RevenueSourceFreshnessRevalidationV1 {
  const evaluatedAtMs = validIsoInstant(evaluatedAt);
  if (evaluatedAtMs === null) {
    return finalize(
      "NOT_READY",
      "INVALID_EVALUATION_TIME",
      evaluatedAt,
      [],
      null,
      ["Revenue source freshness requires a strict ISO evaluation instant."],
    );
  }
  if (!validPolicy(policy)) {
    return finalize(
      "NOT_READY",
      "INVALID_FRESHNESS_POLICY",
      evaluatedAt,
      [],
      null,
      ["Woo, GA4, and Meta each require an explicit positive finite freshness limit."],
    );
  }

  const structuralPacket = buildRevenueDecisionPacketV1(input);
  if (structuralPacket.status === "INVALID_INPUT") {
    return finalize(
      "NOT_READY",
      "INVALID_REVENUE_INPUT",
      evaluatedAt,
      [],
      null,
      ["The canonical revenue input is invalid or unbounded and cannot be freshness-revalidated."],
    );
  }

  const generatedAtMs = validIsoInstant(input.generatedAt);
  if (generatedAtMs === null) {
    return finalize(
      "NOT_READY",
      "INVALID_REVENUE_INPUT",
      evaluatedAt,
      [],
      null,
      ["The canonical revenue packet generation timestamp is not a strict ISO instant."],
    );
  }
  if (generatedAtMs > evaluatedAtMs) {
    return finalize(
      "CONFLICTED",
      "FUTURE_PACKET_GENERATION",
      evaluatedAt,
      [],
      null,
      ["The revenue packet claims to have been generated after the current decision evaluation instant."],
    );
  }

  const sourceStatus: RevenueSourceFreshnessStatusV1[] = [];
  const observations = input.observations.map((observation) => {
    const observedAtMs = validIsoInstant(observation.observedAt);
    if (observedAtMs === null) {
      sourceStatus.push({
        source: observation.source,
        inputTruthState: observation.truthState,
        decisionTruthState: "CONFLICTED",
        observedAt: observation.observedAt,
        ageHours: null,
        maxAgeHours: policy[observation.source],
      });
      return { ...observation, truthState: "CONFLICTED" as const };
    }

    const ageHours = (evaluatedAtMs - observedAtMs) / HOUR_MS;
    let decisionTruthState = observation.truthState;
    if (observedAtMs > evaluatedAtMs) decisionTruthState = "CONFLICTED";
    else if (observation.truthState === "CURRENT" && ageHours > policy[observation.source]) {
      decisionTruthState = "STALE";
    }

    sourceStatus.push({
      source: observation.source,
      inputTruthState: observation.truthState,
      decisionTruthState,
      observedAt: observation.observedAt,
      ageHours,
      maxAgeHours: policy[observation.source],
    });
    return {
      ...observation,
      truthState: decisionTruthState,
      current: { ...observation.current },
      previous: { ...observation.previous },
      evidenceRefs: [...observation.evidenceRefs],
    };
  });

  if (sourceStatus.some((item) => item.ageHours === null)) {
    return finalize(
      "CONFLICTED",
      "INVALID_SOURCE_TIMESTAMP",
      evaluatedAt,
      sourceStatus,
      null,
      ["At least one revenue source observation lacks a valid strict ISO timestamp."],
    );
  }
  if (sourceStatus.some((item) => item.ageHours !== null && item.ageHours < 0)) {
    return finalize(
      "CONFLICTED",
      "FUTURE_SOURCE_OBSERVATION",
      evaluatedAt,
      sourceStatus,
      null,
      ["At least one revenue source observation is dated after the decision evaluation instant."],
    );
  }

  const allCurrent = sourceStatus.length === SOURCES.length
    && sourceStatus.every((item) => item.decisionTruthState === "CURRENT");
  if (!allCurrent) {
    const limitations = sourceStatus
      .filter((item) => item.decisionTruthState !== "CURRENT")
      .map((item) => `${item.source} source truth is ${item.decisionTruthState} at decision time.`);
    return finalize(
      "NOT_READY",
      "SOURCE_EVIDENCE_NOT_CURRENT",
      evaluatedAt,
      sourceStatus,
      null,
      limitations,
    );
  }

  const acceptedInput: RevenueDecisionPacketInputV1 = {
    generatedAt: evaluatedAt,
    currentRange: { ...input.currentRange },
    comparisonRange: { ...input.comparisonRange },
    observations,
  };
  return finalize(
    "READY",
    "ALL_SOURCES_CURRENT",
    evaluatedAt,
    sourceStatus,
    acceptedInput,
    [
      "Fresh source evidence may enter the canonical revenue decision builder; freshness alone does not establish causality, attribution, expected lift, or monetary impact.",
    ],
  );
}

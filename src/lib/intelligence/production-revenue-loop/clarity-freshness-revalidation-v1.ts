import type { ClarityBehaviorViewModelV1 } from "@/lib/clarity-behavior/view-model-v1";

export const CLARITY_FRESHNESS_REVALIDATION_VERSION =
  "CLARITY_FRESHNESS_REVALIDATION_V1" as const;

export type ClarityFreshnessRevalidationStatusV1 =
  | "READY"
  | "NOT_READY"
  | "STALE"
  | "CONFLICTED";

export type ClarityFreshnessRevalidationReasonV1 =
  | "CLARITY_EVIDENCE_ACCEPTED"
  | "CLARITY_EVIDENCE_MISSING"
  | "CLARITY_NOT_DECISION_GRADE"
  | "INVALID_FRESHNESS_POLICY"
  | "INVALID_FRESHNESS_EVIDENCE"
  | "INVALID_CLARITY_RANGE"
  | "FUTURE_EXTRACTION"
  | "STALE_EXTRACTION"
  | "COVERAGE_INCOMPLETE"
  | "FUTURE_COVERAGE"
  | "COVERAGE_AFTER_EXTRACTION"
  | "UPSTREAM_CONFLICT";

export type ClarityFreshnessRevalidationInputV1 = {
  clarity: ClarityBehaviorViewModelV1 | null;
  evaluatedAt: string;
  maxAgeHours: number;
};

export type ClarityFreshnessRevalidationV1 = {
  version: typeof CLARITY_FRESHNESS_REVALIDATION_VERSION;
  status: ClarityFreshnessRevalidationStatusV1;
  reasonCode: ClarityFreshnessRevalidationReasonV1;
  evaluatedAt: string;
  extractedAt: string | null;
  completeThrough: string | null;
  ageHours: number | null;
  acceptedClarity: ClarityBehaviorViewModelV1 | null;
  limitations: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  expectedLift: null;
  monetaryValue: null;
  externalMutationAllowed: false;
  metaWriteAllowed: false;
  approvalBypassAllowed: false;
};

const HOUR_MS = 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function validCalendarDate(value: string | null | undefined): number | null {
  if (!value || !DATE_ONLY_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().slice(0, 10) === value
    ? milliseconds
    : null;
}

function validIsoInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match || validCalendarDate(match[1]) === null) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function utcDate(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function finalize(
  input: ClarityFreshnessRevalidationInputV1,
  status: ClarityFreshnessRevalidationStatusV1,
  reasonCode: ClarityFreshnessRevalidationReasonV1,
  ageHours: number | null,
  acceptedClarity: ClarityBehaviorViewModelV1 | null,
  limitations: readonly string[],
): ClarityFreshnessRevalidationV1 {
  return Object.freeze({
    version: CLARITY_FRESHNESS_REVALIDATION_VERSION,
    status,
    reasonCode,
    evaluatedAt: input.evaluatedAt,
    extractedAt: input.clarity?.extractedAt ?? null,
    completeThrough: input.clarity?.completeThrough ?? null,
    ageHours,
    acceptedClarity,
    limitations: Object.freeze([...limitations]),
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
 * Revalidates a canonical Clarity behavior view at the later revenue-decision
 * instant. A view that was READY when it was built can age before it is reused
 * by Revenue + Behavioral Intelligence, so this boundary requires an explicit
 * caller-supplied freshness policy and fails closed on stale, future, partial,
 * or contradictory evidence.
 *
 * Acceptance only permits the existing view to participate in downstream
 * corroboration. It does not establish causality, revenue/channel attribution,
 * expected lift, monetary impact, or authority to mutate Clarity, the website,
 * checkout, pricing, email, or Meta.
 */
export function revalidateClarityFreshnessV1(
  input: ClarityFreshnessRevalidationInputV1,
): ClarityFreshnessRevalidationV1 {
  const clarity = input.clarity;
  if (!clarity) {
    return finalize(
      input,
      "NOT_READY",
      "CLARITY_EVIDENCE_MISSING",
      null,
      null,
      ["Clarity behavioral evidence is missing and cannot corroborate a revenue decision."],
    );
  }

  if (clarity.state === "CONFLICTED") {
    return finalize(
      input,
      "CONFLICTED",
      "UPSTREAM_CONFLICT",
      null,
      null,
      ["Conflicted Clarity evidence remains fail-closed at decision time."],
    );
  }

  if (clarity.state !== "READY" || clarity.decisionGrade !== true) {
    return finalize(
      input,
      clarity.state === "STALE" ? "STALE" : "NOT_READY",
      clarity.state === "STALE" ? "STALE_EXTRACTION" : "CLARITY_NOT_DECISION_GRADE",
      null,
      null,
      ["Only canonical READY, decision-grade Clarity evidence may enter revenue behavioral corroboration."],
    );
  }

  const evaluatedAtMs = validIsoInstant(input.evaluatedAt);
  if (
    evaluatedAtMs === null
    || typeof input.maxAgeHours !== "number"
    || !Number.isFinite(input.maxAgeHours)
    || input.maxAgeHours <= 0
  ) {
    return finalize(
      input,
      "NOT_READY",
      "INVALID_FRESHNESS_POLICY",
      null,
      null,
      ["Decision-time Clarity freshness requires a valid evaluation instant and a positive finite maximum evidence age."],
    );
  }

  const extractedAtMs = validIsoInstant(clarity.extractedAt);
  const completeThroughMs = validCalendarDate(clarity.completeThrough);
  if (extractedAtMs === null || completeThroughMs === null) {
    return finalize(
      input,
      "NOT_READY",
      "INVALID_FRESHNESS_EVIDENCE",
      null,
      null,
      ["Clarity evidence must carry a valid extraction instant and complete-through calendar date."],
    );
  }

  const currentStartMs = validCalendarDate(clarity.currentRange.startDate);
  const currentEndMs = validCalendarDate(clarity.currentRange.endDate);
  const priorStartMs = validCalendarDate(clarity.priorRange.startDate);
  const priorEndMs = validCalendarDate(clarity.priorRange.endDate);
  if (
    currentStartMs === null
    || currentEndMs === null
    || priorStartMs === null
    || priorEndMs === null
    || currentStartMs > currentEndMs
    || priorStartMs > priorEndMs
  ) {
    return finalize(
      input,
      "CONFLICTED",
      "INVALID_CLARITY_RANGE",
      null,
      null,
      ["Invalid Clarity calendar ranges cannot be accepted as current behavioral evidence."],
    );
  }

  if (extractedAtMs > evaluatedAtMs) {
    return finalize(
      input,
      "CONFLICTED",
      "FUTURE_EXTRACTION",
      null,
      null,
      ["Clarity evidence is dated after the revenue decision evaluation instant and cannot be treated as current truth."],
    );
  }

  const ageHours = (evaluatedAtMs - extractedAtMs) / HOUR_MS;
  const evaluatedDateMs = validCalendarDate(utcDate(evaluatedAtMs)) as number;
  const extractedDateMs = validCalendarDate(utcDate(extractedAtMs)) as number;

  if (currentEndMs > evaluatedDateMs || completeThroughMs > evaluatedDateMs) {
    return finalize(
      input,
      "CONFLICTED",
      "FUTURE_COVERAGE",
      ageHours,
      null,
      ["Clarity range or completeness claims extend beyond the revenue decision evaluation date."],
    );
  }

  if (completeThroughMs > extractedDateMs) {
    return finalize(
      input,
      "CONFLICTED",
      "COVERAGE_AFTER_EXTRACTION",
      ageHours,
      null,
      ["Clarity evidence claims completeness through a calendar date later than its own extraction time."],
    );
  }

  if (completeThroughMs < currentEndMs) {
    return finalize(
      input,
      "NOT_READY",
      "COVERAGE_INCOMPLETE",
      ageHours,
      null,
      ["Clarity evidence is not complete through the selected current reporting range."],
    );
  }

  if (ageHours > input.maxAgeHours) {
    return finalize(
      input,
      "STALE",
      "STALE_EXTRACTION",
      ageHours,
      null,
      [
        `Clarity evidence is ${ageHours.toFixed(2)} hour(s) old, beyond the caller-supplied ${input.maxAgeHours} hour freshness limit.`,
      ],
    );
  }

  return finalize(
    input,
    "READY",
    "CLARITY_EVIDENCE_ACCEPTED",
    ageHours,
    clarity,
    [
      "Freshness acceptance only permits this Clarity view to participate in downstream corroboration; it does not establish a behavioral cause, channel attribution, expected lift, or monetary impact.",
    ],
  );
}

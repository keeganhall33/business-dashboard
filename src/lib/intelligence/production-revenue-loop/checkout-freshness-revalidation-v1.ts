import type { CheckoutDiagnosticsViewModelV1 } from "@/lib/checkout-diagnostics/view-model-v1";

export const CHECKOUT_FRESHNESS_REVALIDATION_VERSION =
  "CHECKOUT_FRESHNESS_REVALIDATION_V1" as const;

export type CheckoutFreshnessRevalidationStatusV1 =
  | "READY"
  | "NOT_READY"
  | "STALE"
  | "CONFLICTED";

export type CheckoutFreshnessRevalidationReasonV1 =
  | "CHECKOUT_EVIDENCE_ACCEPTED"
  | "CHECKOUT_EVIDENCE_MISSING"
  | "CHECKOUT_NOT_DECISION_GRADE"
  | "SOURCE_TRUTH_NOT_COMPLETE"
  | "INVALID_FRESHNESS_POLICY"
  | "INVALID_FRESHNESS_EVIDENCE"
  | "INVALID_CHECKOUT_RANGE"
  | "FUTURE_AS_OF"
  | "STALE_AS_OF"
  | "COVERAGE_INCOMPLETE"
  | "FUTURE_COVERAGE"
  | "COVERAGE_AFTER_EXTRACTION"
  | "UPSTREAM_CONFLICT";

export type CheckoutFreshnessRevalidationInputV1 = {
  checkout: CheckoutDiagnosticsViewModelV1 | null;
  evaluatedAt: string;
  maxAgeHours: number;
};

export type CheckoutFreshnessRevalidationV1 = {
  version: typeof CHECKOUT_FRESHNESS_REVALIDATION_VERSION;
  status: CheckoutFreshnessRevalidationStatusV1;
  reasonCode: CheckoutFreshnessRevalidationReasonV1;
  evaluatedAt: string;
  observedAt: string | null;
  completeThrough: string | null;
  ageHours: number | null;
  acceptedCheckout: CheckoutDiagnosticsViewModelV1 | null;
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
  input: CheckoutFreshnessRevalidationInputV1,
  status: CheckoutFreshnessRevalidationStatusV1,
  reasonCode: CheckoutFreshnessRevalidationReasonV1,
  ageHours: number | null,
  acceptedCheckout: CheckoutDiagnosticsViewModelV1 | null,
  limitations: readonly string[],
): CheckoutFreshnessRevalidationV1 {
  return Object.freeze({
    version: CHECKOUT_FRESHNESS_REVALIDATION_VERSION,
    status,
    reasonCode,
    evaluatedAt: input.evaluatedAt,
    observedAt: input.checkout?.asOf ?? null,
    completeThrough: input.checkout?.completeThrough ?? null,
    ageHours,
    acceptedCheckout,
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
 * Revalidates canonical checkout diagnostics at decision time before they are
 * allowed into the Revenue + Behavioral Intelligence loop.
 *
 * The checkout view model historically proves coverage through the selected
 * period, but its `asOf` field alone does not prove that the evidence is still
 * fresh when a later revenue decision is generated. This boundary requires an
 * explicit caller-supplied freshness policy and fails closed on stale, future,
 * partial, or contradictory evidence. It does not reinterpret checkout
 * behavior, establish causality/attribution, or authorize any provider write.
 */
export function revalidateCheckoutFreshnessV1(
  input: CheckoutFreshnessRevalidationInputV1,
): CheckoutFreshnessRevalidationV1 {
  const checkout = input.checkout;
  if (!checkout) {
    return finalize(
      input,
      "NOT_READY",
      "CHECKOUT_EVIDENCE_MISSING",
      null,
      null,
      ["Checkout diagnostics are missing and cannot corroborate a revenue decision."],
    );
  }

  const hasUpstreamConflict =
    checkout.state === "CONFLICTED"
    || checkout.integrityIssues.some((issue) => issue.severity === "CONFLICT")
    || Object.values(checkout.sourceTruth).some((truth) => truth === "CONFLICTED");
  if (hasUpstreamConflict) {
    return finalize(
      input,
      "CONFLICTED",
      "UPSTREAM_CONFLICT",
      null,
      null,
      ["Conflicted checkout evidence remains fail-closed at decision time."],
    );
  }

  if (
    checkout.state !== "READY"
    || checkout.decisionGrade !== true
    || checkout.integrityIssues.length > 0
  ) {
    return finalize(
      input,
      "NOT_READY",
      "CHECKOUT_NOT_DECISION_GRADE",
      null,
      null,
      ["Only canonical READY checkout diagnostics with no integrity issues may enter behavioral corroboration."],
    );
  }

  if (Object.values(checkout.sourceTruth).some((truth) => truth !== "COMPLETE")) {
    return finalize(
      input,
      "NOT_READY",
      "SOURCE_TRUTH_NOT_COMPLETE",
      null,
      null,
      ["Meta, GA4, FunnelKit, and Woo checkout source truth must all remain COMPLETE before checkout evidence is reused."],
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
      ["Decision-time checkout freshness requires a valid evaluation instant and a positive finite maximum evidence age."],
    );
  }

  const observedAtMs = validIsoInstant(checkout.asOf);
  const completeThroughMs = validCalendarDate(checkout.completeThrough);
  if (observedAtMs === null || completeThroughMs === null) {
    return finalize(
      input,
      "NOT_READY",
      "INVALID_FRESHNESS_EVIDENCE",
      null,
      null,
      ["Checkout evidence must carry a valid observed-at instant and complete-through calendar date."],
    );
  }

  const currentEndMs = validCalendarDate(checkout.currentRange.endDate);
  const currentStartMs = validCalendarDate(checkout.currentRange.startDate);
  const priorStartMs = validCalendarDate(checkout.priorRange.startDate);
  const priorEndMs = validCalendarDate(checkout.priorRange.endDate);
  if (
    currentEndMs === null
    || currentStartMs === null
    || priorStartMs === null
    || priorEndMs === null
    || currentStartMs > currentEndMs
    || priorStartMs > priorEndMs
  ) {
    return finalize(
      input,
      "CONFLICTED",
      "INVALID_CHECKOUT_RANGE",
      null,
      null,
      ["Invalid checkout calendar ranges cannot be accepted as fresh behavioral evidence."],
    );
  }

  if (observedAtMs > evaluatedAtMs) {
    return finalize(
      input,
      "CONFLICTED",
      "FUTURE_AS_OF",
      null,
      null,
      ["Checkout evidence is dated after the decision evaluation instant and cannot be treated as current truth."],
    );
  }

  const evaluatedDateMs = validCalendarDate(utcDate(evaluatedAtMs)) as number;
  const observedDateMs = validCalendarDate(utcDate(observedAtMs)) as number;
  if (currentEndMs > evaluatedDateMs || completeThroughMs > evaluatedDateMs) {
    return finalize(
      input,
      "CONFLICTED",
      "FUTURE_COVERAGE",
      (evaluatedAtMs - observedAtMs) / HOUR_MS,
      null,
      ["Checkout range or completeness claims extend beyond the decision evaluation date."],
    );
  }

  if (completeThroughMs > observedDateMs) {
    return finalize(
      input,
      "CONFLICTED",
      "COVERAGE_AFTER_EXTRACTION",
      (evaluatedAtMs - observedAtMs) / HOUR_MS,
      null,
      ["Checkout evidence claims completeness through a calendar date later than its own extraction time."],
    );
  }

  if (completeThroughMs < currentEndMs) {
    return finalize(
      input,
      "NOT_READY",
      "COVERAGE_INCOMPLETE",
      (evaluatedAtMs - observedAtMs) / HOUR_MS,
      null,
      ["Checkout evidence is not complete through the selected current reporting range."],
    );
  }

  const ageHours = (evaluatedAtMs - observedAtMs) / HOUR_MS;
  if (ageHours > input.maxAgeHours) {
    return finalize(
      input,
      "STALE",
      "STALE_AS_OF",
      ageHours,
      null,
      [
        `Checkout evidence is ${ageHours.toFixed(2)} hour(s) old, beyond the caller-supplied ${input.maxAgeHours} hour freshness limit.`,
      ],
    );
  }

  return finalize(
    input,
    "READY",
    "CHECKOUT_EVIDENCE_ACCEPTED",
    ageHours,
    checkout,
    [
      "Freshness acceptance only permits this checkout view to participate in downstream corroboration; it does not establish a checkout cause, channel attribution, expected lift, or monetary impact.",
    ],
  );
}

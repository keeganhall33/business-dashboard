import {
  evaluateRevenueOutcomeV1,
  type RevenueOutcomeEvaluationInputV1,
  type RevenueOutcomeEvaluationV1,
  type RevenueOutcomeObservationV1,
} from "./revenue-outcome-evaluation-v1";

export const REVENUE_OUTCOME_WINDOW_INTEGRITY_VERSION =
  "REVENUE_OUTCOME_WINDOW_INTEGRITY_V1" as const;

export type RevenueOutcomeWindowIntegrityStatusV1 = "EVALUATED" | "BLOCKED";

export type RevenueOutcomeWindowIntegrityReasonV1 =
  | "WINDOW_INTEGRITY_CONFIRMED"
  | "UPSTREAM_EVALUATION_NOT_MEASURED"
  | "BASELINE_RANGE_MISMATCH_ACROSS_SOURCES"
  | "OUTCOME_RANGE_MISMATCH_ACROSS_SOURCES"
  | "MEASUREMENT_WINDOW_NOT_CLOSED"
  | "FUTURE_COVERAGE_CLAIM"
  | "IMPLEMENTATION_DAY_MIXED_INTO_OUTCOME";

export interface RevenueOutcomeWindowIntegrityV1 {
  version: typeof REVENUE_OUTCOME_WINDOW_INTEGRITY_VERSION;
  status: RevenueOutcomeWindowIntegrityStatusV1;
  reasonCode: RevenueOutcomeWindowIntegrityReasonV1;
  decisionRef: string;
  implementationRef: string;
  evaluatedAt: string;
  upstreamStatus: RevenueOutcomeEvaluationV1["status"];
  upstreamReasonCodes: readonly string[];
  canonicalWindows: {
    baseline: Readonly<{ startDate: string; endDate: string }> | null;
    outcome: Readonly<{ startDate: string; endDate: string }> | null;
  };
  evaluation: RevenueOutcomeEvaluationV1 | null;
  limitations: readonly string[];
  authority: {
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function dateOnlyFromInstant(value: string): string | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function rangeKey(observation: RevenueOutcomeObservationV1): string {
  return `${observation.range.startDate}\u0000${observation.range.endDate}`;
}

function uniqueRangeKeys(observations: RevenueOutcomeObservationV1[]): string[] {
  return [...new Set(observations.map(rangeKey))].sort();
}

function copyCanonicalRange(
  observations: RevenueOutcomeObservationV1[],
): { startDate: string; endDate: string } | null {
  const range = observations[0]?.range;
  return range ? { ...range } : null;
}

function blocked(
  input: RevenueOutcomeEvaluationInputV1,
  upstream: RevenueOutcomeEvaluationV1,
  reasonCode: RevenueOutcomeWindowIntegrityReasonV1,
  limitations: readonly string[],
): RevenueOutcomeWindowIntegrityV1 {
  return deepFreeze({
    version: REVENUE_OUTCOME_WINDOW_INTEGRITY_VERSION,
    status: "BLOCKED",
    reasonCode,
    decisionRef: input.decisionRef,
    implementationRef: input.implementationRef,
    evaluatedAt: input.evaluatedAt,
    upstreamStatus: upstream.status,
    upstreamReasonCodes: [...upstream.reasonCodes],
    canonicalWindows: {
      baseline: null,
      outcome: null,
    },
    evaluation: null,
    limitations: [...limitations],
    authority: {
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      actionExecutionAllowed: false,
      approvalBypassAllowed: false,
    },
  });
}

/**
 * Fail-closed temporal boundary for the observed revenue outcome loop.
 *
 * The underlying evaluator already requires current, evidence-backed, matched
 * observations. This gate adds cross-source date-range truth that matters when
 * WooCommerce, GA4, Meta, Clarity, and FunnelKit evidence is reviewed together:
 * every source must describe the same baseline and outcome windows, daily
 * outcome windows cannot mix the implementation calendar day into the post
 * period, and neither a measurement window nor a completeness claim may reach
 * into the evaluation day/future.
 *
 * The gate measures no new facts, establishes no causality or attribution, and
 * grants no mutation authority. A blocked preflight never exposes an otherwise
 * measured upstream evaluation for downstream learning/reallocation.
 */
export function evaluateRevenueOutcomeWithWindowIntegrityV1(
  input: RevenueOutcomeEvaluationInputV1,
): RevenueOutcomeWindowIntegrityV1 {
  const upstream = evaluateRevenueOutcomeV1(input);

  if (upstream.status !== "MEASURED" && upstream.status !== "MEASURED_WITH_CONFOUNDERS") {
    return blocked(
      input,
      upstream,
      "UPSTREAM_EVALUATION_NOT_MEASURED",
      [
        "Outcome learning remains blocked until the canonical evaluator has current, complete, non-conflicted matched evidence.",
      ],
    );
  }

  const baseline = input.baseline;
  const outcome = input.outcome;

  if (uniqueRangeKeys(baseline).length !== 1) {
    return blocked(
      input,
      upstream,
      "BASELINE_RANGE_MISMATCH_ACROSS_SOURCES",
      [
        "WooCommerce, GA4, Meta, Clarity, and FunnelKit observations cannot be treated as one baseline when their date ranges differ.",
      ],
    );
  }

  if (uniqueRangeKeys(outcome).length !== 1) {
    return blocked(
      input,
      upstream,
      "OUTCOME_RANGE_MISMATCH_ACROSS_SOURCES",
      [
        "WooCommerce, GA4, Meta, Clarity, and FunnelKit observations cannot be treated as one outcome period when their date ranges differ.",
      ],
    );
  }

  const evaluatedDate = dateOnlyFromInstant(input.evaluatedAt);
  const implementationDate = dateOnlyFromInstant(input.implementedAt);
  const canonicalBaseline = copyCanonicalRange(baseline);
  const canonicalOutcome = copyCanonicalRange(outcome);

  // A measured upstream result guarantees valid instants and non-empty ranges.
  if (!evaluatedDate || !implementationDate || !canonicalBaseline || !canonicalOutcome) {
    return blocked(
      input,
      upstream,
      "UPSTREAM_EVALUATION_NOT_MEASURED",
      ["Canonical measurement timestamps or ranges are unavailable."],
    );
  }

  if (canonicalBaseline.endDate >= evaluatedDate || canonicalOutcome.endDate >= evaluatedDate) {
    return blocked(
      input,
      upstream,
      "MEASUREMENT_WINDOW_NOT_CLOSED",
      [
        "Date-granularity measurement windows must end before the evaluation calendar day; an in-progress day cannot be promoted to a closed outcome period.",
      ],
    );
  }

  const futureCoverage = [...baseline, ...outcome].some(
    (observation) =>
      observation.completeThrough !== null && observation.completeThrough >= evaluatedDate,
  );
  if (futureCoverage) {
    return blocked(
      input,
      upstream,
      "FUTURE_COVERAGE_CLAIM",
      [
        "A source completeness claim cannot include the evaluation calendar day or a future date when daily coverage may still be open.",
      ],
    );
  }

  if (canonicalOutcome.startDate <= implementationDate) {
    return blocked(
      input,
      upstream,
      "IMPLEMENTATION_DAY_MIXED_INTO_OUTCOME",
      [
        "A date-granularity post period must start after the implementation calendar day so pre-change and post-change hours are not mixed into one daily observation.",
      ],
    );
  }

  return deepFreeze({
    version: REVENUE_OUTCOME_WINDOW_INTEGRITY_VERSION,
    status: "EVALUATED",
    reasonCode: "WINDOW_INTEGRITY_CONFIRMED",
    decisionRef: input.decisionRef,
    implementationRef: input.implementationRef,
    evaluatedAt: input.evaluatedAt,
    upstreamStatus: upstream.status,
    upstreamReasonCodes: [...upstream.reasonCodes],
    canonicalWindows: {
      baseline: canonicalBaseline,
      outcome: canonicalOutcome,
    },
    evaluation: upstream,
    limitations: [
      "Aligned closed pre/post windows support arithmetic comparison only; they do not establish that the implementation caused any observed change.",
      "No source movement is attributed to Meta, FunnelKit, Clarity, or any other channel without separate evidence establishing that claim.",
    ],
    authority: {
      externalMutationAllowed: false,
      metaWriteAllowed: false,
      actionExecutionAllowed: false,
      approvalBypassAllowed: false,
    },
  });
}

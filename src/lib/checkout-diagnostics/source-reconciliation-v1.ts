export const CHECKOUT_SOURCE_RECONCILIATION_VERSION =
  "CHECKOUT_SOURCE_RECONCILIATION_V1" as const;

export type CheckoutReconciliationSourceV1 =
  | "FUNNELKIT"
  | "WOO"
  | "GA4"
  | "META";
export type CheckoutReconciliationTruthV1 =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type CheckoutReconciliationObservationV1 = {
  source: CheckoutReconciliationSourceV1;
  truthState: CheckoutReconciliationTruthV1;
  range: { startDate: string; endDate: string };
  observedAt: string;
  completeThrough: string | null;
  metricDefinitionId: string | null;
  completionCount: number | null;
  evidenceRefs: string[];
};

export type CheckoutSourceReconciliationInputV1 = {
  generatedAt: string;
  expectedRange: { startDate: string; endDate: string };
  materialDifferenceRatio: number;
  observations: CheckoutReconciliationObservationV1[];
};

export type CheckoutSourceComparisonV1 = {
  leftSource: CheckoutReconciliationSourceV1;
  rightSource: CheckoutReconciliationSourceV1;
  metricDefinitionId: string;
  leftCount: number;
  rightCount: number;
  absoluteDifference: number;
  relativeDifference: number;
  materialDifference: boolean;
};

export type CheckoutSourceReconciliationV1 = {
  version: typeof CHECKOUT_SOURCE_RECONCILIATION_VERSION;
  status:
    | "READY"
    | "VERIFY_TRACKING"
    | "INSUFFICIENT_EVIDENCE"
    | "CONFLICTED"
    | "INVALID_INPUT";
  reasonCode: string;
  generatedAt: string;
  expectedRange: { startDate: string; endDate: string };
  materialDifferenceRatio: number | null;
  sourceCoverage: ReadonlyArray<{
    source: CheckoutReconciliationSourceV1;
    truthState: CheckoutReconciliationTruthV1;
    evidenceRefs: readonly string[];
  }>;
  comparisons: readonly CheckoutSourceComparisonV1[];
  limitations: readonly string[];
  attributionNote: string;
  externalMutationPerformed: false;
};

const SOURCES: readonly CheckoutReconciliationSourceV1[] = [
  "FUNNELKIT",
  "WOO",
  "GA4",
  "META"
];
const TRUTH_STATES: readonly CheckoutReconciliationTruthV1[] = [
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE"
];
const MAX_EVIDENCE_REFS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyValue(value: string | null | undefined): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.NaN;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
}

function validRange(range: { startDate: string; endDate: string }): boolean {
  const start = dateOnlyValue(range.startDate);
  const end = dateOnlyValue(range.endDate);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
}

function validEvidenceRefs(refs: unknown): refs is string[] {
  return (
    Array.isArray(refs) &&
    refs.length <= MAX_EVIDENCE_REFS &&
    refs.every(
      (ref) =>
        typeof ref === "string" &&
        ref.trim().length > 0 &&
        ref.length <= 200
    )
  );
}

function validObservationShape(
  observation: CheckoutReconciliationObservationV1
): boolean {
  return Boolean(
    observation &&
      SOURCES.includes(observation.source) &&
      TRUTH_STATES.includes(observation.truthState) &&
      validRange(observation.range) &&
      Number.isFinite(Date.parse(observation.observedAt)) &&
      (observation.completeThrough === null ||
        Number.isFinite(dateOnlyValue(observation.completeThrough))) &&
      (observation.metricDefinitionId === null ||
        (typeof observation.metricDefinitionId === "string" &&
          observation.metricDefinitionId.trim().length > 0 &&
          observation.metricDefinitionId.length <= 100)) &&
      (observation.completionCount === null ||
        (Number.isInteger(observation.completionCount) &&
          observation.completionCount >= 0)) &&
      validEvidenceRefs(observation.evidenceRefs)
  );
}

function freezeResult(
  result: CheckoutSourceReconciliationV1
): CheckoutSourceReconciliationV1 {
  Object.freeze(result.expectedRange);
  result.sourceCoverage.forEach((coverage) => {
    Object.freeze(coverage.evidenceRefs);
    Object.freeze(coverage);
  });
  Object.freeze(result.sourceCoverage);
  result.comparisons.forEach(Object.freeze);
  Object.freeze(result.comparisons);
  Object.freeze(result.limitations);
  return Object.freeze(result);
}

function baseCoverage(
  observations: CheckoutReconciliationObservationV1[]
): CheckoutSourceReconciliationV1["sourceCoverage"] {
  const bySource = new Map(observations.map((observation) => [observation.source, observation]));
  return SOURCES.map((source) => {
    const observation = bySource.get(source);
    return {
      source,
      truthState: observation?.truthState ?? "UNKNOWN",
      evidenceRefs: Object.freeze([...(observation?.evidenceRefs ?? [])].sort())
    };
  });
}

function result(
  input: CheckoutSourceReconciliationInputV1,
  status: CheckoutSourceReconciliationV1["status"],
  reasonCode: string,
  comparisons: CheckoutSourceComparisonV1[],
  limitations: string[],
  materialDifferenceRatio: number | null = input.materialDifferenceRatio
): CheckoutSourceReconciliationV1 {
  return freezeResult({
    version: CHECKOUT_SOURCE_RECONCILIATION_VERSION,
    status,
    reasonCode,
    generatedAt: input?.generatedAt ?? "UNKNOWN",
    expectedRange: input?.expectedRange
      ? { ...input.expectedRange }
      : { startDate: "UNKNOWN", endDate: "UNKNOWN" },
    materialDifferenceRatio,
    sourceCoverage: baseCoverage(Array.isArray(input?.observations) ? input.observations : []),
    comparisons,
    limitations: [...new Set(limitations)].sort(),
    attributionNote:
      "Cross-source completion counts can surface measurement disagreement only when their metric definitions are explicitly identical. A discrepancy does not identify which source is wrong and does not prove checkout friction, channel attribution, or revenue causality.",
    externalMutationPerformed: false
  });
}

function relativeDifference(left: number, right: number): number {
  const denominator = Math.max(left, right);
  if (denominator === 0) return 0;
  return Math.abs(left - right) / denominator;
}

function buildComparisons(
  observations: CheckoutReconciliationObservationV1[],
  threshold: number
): CheckoutSourceComparisonV1[] {
  const comparisons: CheckoutSourceComparisonV1[] = [];
  for (let leftIndex = 0; leftIndex < observations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < observations.length; rightIndex += 1) {
      const left = observations[leftIndex];
      const right = observations[rightIndex];
      if (
        left.metricDefinitionId === null ||
        left.metricDefinitionId !== right.metricDefinitionId ||
        left.completionCount === null ||
        right.completionCount === null
      ) {
        continue;
      }
      const difference = Math.abs(left.completionCount - right.completionCount);
      const ratio = relativeDifference(left.completionCount, right.completionCount);
      comparisons.push({
        leftSource: left.source,
        rightSource: right.source,
        metricDefinitionId: left.metricDefinitionId,
        leftCount: left.completionCount,
        rightCount: right.completionCount,
        absoluteDifference: difference,
        relativeDifference: Math.round(ratio * 1_000_000) / 1_000_000,
        materialDifference: ratio >= threshold
      });
    }
  }
  return comparisons.sort((left, right) =>
    `${left.leftSource}:${left.rightSource}`.localeCompare(
      `${right.leftSource}:${right.rightSource}`
    )
  );
}

export function reconcileCheckoutCompletionSourcesV1(
  input: CheckoutSourceReconciliationInputV1
): CheckoutSourceReconciliationV1 {
  if (
    !input ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    !validRange(input.expectedRange) ||
    typeof input.materialDifferenceRatio !== "number" ||
    !Number.isFinite(input.materialDifferenceRatio) ||
    input.materialDifferenceRatio <= 0 ||
    input.materialDifferenceRatio > 1 ||
    !Array.isArray(input.observations) ||
    input.observations.length > SOURCES.length ||
    input.observations.some((observation) => !validObservationShape(observation))
  ) {
    return result(
      input,
      "INVALID_INPUT",
      "INVALID_OR_UNBOUNDED_INPUT",
      [],
      ["No reconciliation was performed from invalid or unbounded input."],
      null
    );
  }

  const sourceSet = new Set(input.observations.map((observation) => observation.source));
  if (sourceSet.size !== input.observations.length) {
    return result(
      input,
      "INVALID_INPUT",
      "DUPLICATE_SOURCE",
      [],
      ["Each checkout evidence source may appear at most once."],
      null
    );
  }

  const generatedAt = Date.parse(input.generatedAt);
  const expectedEnd = dateOnlyValue(input.expectedRange.endDate);
  const contradictions: string[] = [];
  for (const observation of input.observations) {
    if (
      observation.range.startDate !== input.expectedRange.startDate ||
      observation.range.endDate !== input.expectedRange.endDate
    ) {
      contradictions.push(`${observation.source} range does not match the requested reconciliation period.`);
    }
    if (Date.parse(observation.observedAt) > generatedAt) {
      contradictions.push(`${observation.source} evidence is future-dated relative to reconciliation generation.`);
    }
    if (observation.truthState === "CONFLICTED") {
      contradictions.push(`${observation.source} evidence is explicitly conflicted.`);
    }
    if (observation.truthState === "COMPLETE") {
      const completeThrough = dateOnlyValue(observation.completeThrough);
      if (!Number.isFinite(completeThrough) || completeThrough < expectedEnd) {
        contradictions.push(`${observation.source} is marked COMPLETE without coverage through the requested period end.`);
      }
      if (
        observation.metricDefinitionId === null ||
        observation.completionCount === null ||
        observation.evidenceRefs.length === 0
      ) {
        contradictions.push(`${observation.source} is marked COMPLETE without definition, count, and evidence provenance.`);
      }
    }
  }

  if (contradictions.length > 0) {
    return result(
      input,
      "CONFLICTED",
      "SOURCE_EVIDENCE_CONTRADICTION",
      [],
      contradictions
    );
  }

  const complete = input.observations.filter(
    (observation) => observation.truthState === "COMPLETE"
  );
  if (complete.length < 2) {
    return result(
      input,
      "INSUFFICIENT_EVIDENCE",
      "COMPARABLE_SOURCE_COVERAGE_INCOMPLETE",
      [],
      ["At least two complete, evidence-backed checkout sources are required for reconciliation."]
    );
  }

  const definitions = new Set(
    complete.map((observation) => observation.metricDefinitionId)
  );
  if (definitions.size !== 1) {
    return result(
      input,
      "INSUFFICIENT_EVIDENCE",
      "METRIC_DEFINITIONS_NOT_COMPARABLE",
      [],
      ["Complete sources use different metric definitions, so their counts cannot be compared safely."]
    );
  }

  const comparisons = buildComparisons(complete, input.materialDifferenceRatio);
  if (comparisons.length === 0) {
    return result(
      input,
      "INSUFFICIENT_EVIDENCE",
      "NO_COMPARABLE_SOURCE_PAIRS",
      [],
      ["No evidence-backed source pair is available for a like-for-like completion comparison."]
    );
  }

  const material = comparisons.some((comparison) => comparison.materialDifference);
  return result(
    input,
    material ? "VERIFY_TRACKING" : "READY",
    material
      ? "MATERIAL_CROSS_SOURCE_DIFFERENCE"
      : "COUNTS_WITHIN_CALLER_SUPPLIED_TOLERANCE",
    comparisons,
    material
      ? [
          "A material measurement difference requires tracking or definition verification before it can support a checkout diagnosis."
        ]
      : [
          "Agreement within tolerance is measurement corroboration only and does not establish causality or attribution."
        ]
  );
}

import type {
  CheckoutReconciliationSourceV1,
  CheckoutSourceReconciliationV1
} from "./source-reconciliation-v1";

export const REVENUE_CLOSED_LOOP_READINESS_VERSION =
  "REVENUE_CLOSED_LOOP_READINESS_V1" as const;

export const REQUIRED_REVENUE_CLOSED_LOOP_SOURCES = [
  "FUNNELKIT",
  "WOO",
  "GA4",
  "META"
] as const satisfies readonly CheckoutReconciliationSourceV1[];

export type RevenueClosedLoopReadinessV1 = {
  version: typeof REVENUE_CLOSED_LOOP_READINESS_VERSION;
  status: "READY_FOR_RECOMMENDATION" | "VERIFY_TRACKING" | "INCOMPLETE";
  decisionGrade: boolean;
  reasonCode:
    | "ALL_REQUIRED_SOURCES_RECONCILED"
    | "REQUIRED_SOURCE_COVERAGE_INCOMPLETE"
    | "SOURCE_RECONCILIATION_NOT_READY"
    | "PAIRWISE_RECONCILIATION_INCOMPLETE"
    | "MATERIAL_CROSS_SOURCE_DIFFERENCE";
  requiredSources: readonly CheckoutReconciliationSourceV1[];
  incompleteSources: readonly CheckoutReconciliationSourceV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  safeguards: Readonly<{
    metaWritesAllowed: false;
    externalWritesAllowed: false;
    attributionEstablished: false;
    causalityEstablished: false;
    monetaryValueEstablished: false;
  }>;
};

const EXPECTED_PAIR_COUNT =
  (REQUIRED_REVENUE_CLOSED_LOOP_SOURCES.length *
    (REQUIRED_REVENUE_CLOSED_LOOP_SOURCES.length - 1)) /
  2;

function orderedPairKey(
  left: CheckoutReconciliationSourceV1,
  right: CheckoutReconciliationSourceV1
): string {
  return [left, right].sort().join(":");
}

function freezeResult(
  value: RevenueClosedLoopReadinessV1
): RevenueClosedLoopReadinessV1 {
  Object.freeze(value.requiredSources);
  Object.freeze(value.incompleteSources);
  Object.freeze(value.evidenceRefs);
  Object.freeze(value.limitations);
  Object.freeze(value.safeguards);
  return Object.freeze(value);
}

function buildResult(
  status: RevenueClosedLoopReadinessV1["status"],
  reasonCode: RevenueClosedLoopReadinessV1["reasonCode"],
  reconciliation: CheckoutSourceReconciliationV1,
  incompleteSources: CheckoutReconciliationSourceV1[],
  limitations: string[]
): RevenueClosedLoopReadinessV1 {
  const evidenceRefs = reconciliation.sourceCoverage
    .flatMap((coverage) => coverage.evidenceRefs)
    .filter((ref, index, refs) => refs.indexOf(ref) === index)
    .sort();

  return freezeResult({
    version: REVENUE_CLOSED_LOOP_READINESS_VERSION,
    status,
    decisionGrade: status === "READY_FOR_RECOMMENDATION",
    reasonCode,
    requiredSources: [...REQUIRED_REVENUE_CLOSED_LOOP_SOURCES],
    incompleteSources: [...incompleteSources].sort(),
    evidenceRefs,
    limitations: [...new Set(limitations)].sort(),
    safeguards: {
      metaWritesAllowed: false,
      externalWritesAllowed: false,
      attributionEstablished: false,
      causalityEstablished: false,
      monetaryValueEstablished: false
    }
  });
}

export function assessRevenueClosedLoopReadinessV1(
  reconciliation: CheckoutSourceReconciliationV1
): RevenueClosedLoopReadinessV1 {
  const coverageBySource = new Map(
    reconciliation.sourceCoverage.map((coverage) => [coverage.source, coverage])
  );
  const incompleteSources = REQUIRED_REVENUE_CLOSED_LOOP_SOURCES.filter(
    (source) => coverageBySource.get(source)?.truthState !== "COMPLETE"
  );

  if (incompleteSources.length > 0) {
    return buildResult(
      "INCOMPLETE",
      "REQUIRED_SOURCE_COVERAGE_INCOMPLETE",
      reconciliation,
      incompleteSources,
      [
        "WooCommerce, FunnelKit, GA4, and Meta must each provide complete evidence for the exact reporting period before the closed loop can support a recommendation.",
        ...reconciliation.limitations
      ]
    );
  }

  if (
    reconciliation.status !== "READY" ||
    reconciliation.comparisons.some((comparison) => comparison.materialDifference)
  ) {
    return buildResult(
      "VERIFY_TRACKING",
      reconciliation.comparisons.some((comparison) => comparison.materialDifference)
        ? "MATERIAL_CROSS_SOURCE_DIFFERENCE"
        : "SOURCE_RECONCILIATION_NOT_READY",
      reconciliation,
      [],
      [
        "The four-source closed loop is blocked until source reconciliation is decision-grade.",
        ...reconciliation.limitations
      ]
    );
  }

  const requiredSourceSet = new Set(REQUIRED_REVENUE_CLOSED_LOOP_SOURCES);
  const pairKeys = new Set(
    reconciliation.comparisons
      .filter(
        (comparison) =>
          requiredSourceSet.has(comparison.leftSource) &&
          requiredSourceSet.has(comparison.rightSource)
      )
      .map((comparison) =>
        orderedPairKey(comparison.leftSource, comparison.rightSource)
      )
  );

  if (
    reconciliation.comparisons.length !== EXPECTED_PAIR_COUNT ||
    pairKeys.size !== EXPECTED_PAIR_COUNT
  ) {
    return buildResult(
      "VERIFY_TRACKING",
      "PAIRWISE_RECONCILIATION_INCOMPLETE",
      reconciliation,
      [],
      [
        "All six like-for-like pairwise comparisons across WooCommerce, FunnelKit, GA4, and Meta are required before the closed loop can support a recommendation."
      ]
    );
  }

  return buildResult(
    "READY_FOR_RECOMMENDATION",
    "ALL_REQUIRED_SOURCES_RECONCILED",
    reconciliation,
    [],
    [
      "Cross-source agreement only establishes measurement corroboration within the caller-supplied tolerance. It does not establish channel attribution, causality, confidence, or monetary impact.",
      "This readiness gate authorizes analysis and recommendation preparation only. It performs no Meta or other external writes and grants no execution approval."
    ]
  );
}

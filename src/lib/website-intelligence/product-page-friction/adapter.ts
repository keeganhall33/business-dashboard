import {
  PRODUCT_PAGE_FRICTION_SNAPSHOT_VERSION_V1,
  ProductPageFrictionSnapshotV1Schema,
  type ProductPageConfidenceV1,
  type ProductPageFrictionEvidenceV1,
  type ProductPageFrictionSnapshotV1,
  type ProductPageSeverityV1,
  type ProductPageTruthStateV1
} from "./contracts";

const SEVERITY_SCORE: Record<ProductPageSeverityV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

const CONFIDENCE_SCORE: Record<ProductPageConfidenceV1, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0
};

const TRUTH_SCORE: Record<ProductPageTruthStateV1, number> = {
  KNOWN: 4,
  INFERRED: 3,
  STALE: 2,
  CONFLICTED: 1,
  UNKNOWN: 0
};

function materialityScore(item: ProductPageFrictionEvidenceV1): number {
  return SEVERITY_SCORE[item.severity] * 10_000 + CONFIDENCE_SCORE[item.confidence] * 1_000 + TRUTH_SCORE[item.truth_state] * 100;
}

function rankEvidence(input: ProductPageFrictionEvidenceV1[]): ProductPageFrictionEvidenceV1[] {
  return [...input].sort((left, right) => {
    const delta = materialityScore(right) - materialityScore(left);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
}

function projectionTruthState(top: ProductPageFrictionEvidenceV1 | undefined, evidence: ProductPageFrictionEvidenceV1[]): ProductPageTruthStateV1 {
  if (!top) return "UNKNOWN";
  if (evidence.some((item) => item.truth_state === "CONFLICTED")) return "CONFLICTED";
  return top.truth_state;
}

function projectionConfidence(top: ProductPageFrictionEvidenceV1 | undefined, evidence: ProductPageFrictionEvidenceV1[]): ProductPageConfidenceV1 {
  if (!top) return "UNKNOWN";
  if (top.truth_state === "UNKNOWN") return "UNKNOWN";
  if (evidence.some((item) => item.truth_state === "UNKNOWN" && item.funnel_stage === "TRACKING_COVERAGE")) return "MEDIUM";
  return top.confidence;
}

export function buildProductPageFrictionSnapshotV1(input: {
  generatedAt: string;
  pageScope: string;
  evidence: ProductPageFrictionEvidenceV1[];
}): ProductPageFrictionSnapshotV1 {
  const ranked = rankEvidence(input.evidence);
  const top = ranked.find((item) => item.truth_state !== "UNKNOWN") ?? ranked[0];
  const trackingGap = ranked.find((item) => item.truth_state === "UNKNOWN" && item.funnel_stage === "TRACKING_COVERAGE");

  const snapshot: ProductPageFrictionSnapshotV1 = {
    v: PRODUCT_PAGE_FRICTION_SNAPSHOT_VERSION_V1,
    generated_at: input.generatedAt,
    source_mode: "DETERMINISTIC_FIXTURE",
    page_scope: input.pageScope,
    evidence: ranked,
    projection: {
      WHAT_CHANGED: "Product-page evidence is now grouped into a ranked conversion-friction snapshot.",
      WHY_IT_MATTERS: trackingGap
        ? "The strongest friction can be prioritized, but conversion magnitude remains bounded by an explicit tracking UNKNOWN."
        : "Product-page interest can be compared against checkout progression without changing live site behavior.",
      TOP_FRICTION: top
        ? `${top.funnel_stage}: ${top.observed_signal}`
        : "UNKNOWN: no product-page friction evidence available.",
      NEXT_BEST_TEST: top?.recommended_test ?? "Verify product-page tracking before choosing a test.",
      CONFIDENCE: projectionConfidence(top, ranked),
      TRUTH_STATE: projectionTruthState(top, ranked)
    },
    guardrails: {
      observed_evidence_separate_from_hypothesis: true,
      no_live_site_change: true,
      tracking_gap_preserved_as_unknown: true
    }
  };

  return ProductPageFrictionSnapshotV1Schema.parse(snapshot);
}

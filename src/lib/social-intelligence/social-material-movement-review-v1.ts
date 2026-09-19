import {
  SOCIAL_METRIC_KEYS_V1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1
} from "./social-canonical-v1";
import type {
  SocialHistoryComparabilityReviewV1,
  SocialHistoryMetricComparabilityV1,
  SocialHistoryWindowComparabilityV1
} from "./social-history-comparability-v1";

export const SOCIAL_MATERIAL_MOVEMENT_REVIEW_V1_VERSION = "SocialMaterialMovementReviewV1" as const;

export type SocialMaterialMovementDirectionV1 = "INCREASE" | "DECREASE" | "FLAT";

export type SocialMaterialMovementClassificationV1 =
  | "MATERIAL_MOVEMENT_REVIEW_CANDIDATE"
  | "BELOW_CALLER_THRESHOLD"
  | "BELOW_CALLER_MINIMUM_PRIOR_BASELINE"
  | "UNRESOLVED_ZERO_PRIOR_BASELINE";

export type SocialMaterialMovementReasonV1 =
  | "UPSTREAM_NOT_DECISION_GRADE"
  | "UPSTREAM_FROM_FUTURE"
  | "UPSTREAM_TOO_OLD"
  | "UPSTREAM_TRUTH_WIDENED"
  | "UPSTREAM_WINDOW_BINDING_MISMATCH"
  | "REQUESTED_WINDOW_NOT_DECISION_GRADE"
  | "REQUESTED_METRIC_NOT_DECISION_GRADE"
  | "EVIDENCE_BINDING_MISMATCH"
  | "DELTA_BINDING_MISMATCH"
  | "NO_EVALUABLE_MOVEMENTS";

export type SocialMaterialMovementMetricRuleV1 = Readonly<{
  metric: SocialMetricKeyV1;
  minimumAbsolutePercentageDelta: number;
  minimumPriorValue: number;
}>;

export type SocialMaterialMovementPolicyV1 = Readonly<{
  maxUpstreamAgeHours: number;
  windows: readonly SocialHistoryWindowV1[];
  metricRules: readonly SocialMaterialMovementMetricRuleV1[];
}>;

export type SocialMaterialMovementItemV1 = Readonly<{
  snapshotId: string;
  platform: SocialHistoryComparabilityReviewV1["platform"];
  accountId: string;
  window: SocialHistoryWindowV1;
  metric: SocialMetricKeyV1;
  currentPeriodId: string;
  priorPeriodId: string;
  currentValue: number;
  priorValue: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  direction: SocialMaterialMovementDirectionV1;
  minimumAbsolutePercentageDelta: number;
  minimumPriorValue: number;
  classification: SocialMaterialMovementClassificationV1;
  alertReviewCandidate: boolean;
  evidenceRefs: readonly string[];
  statisticalAnomalyClaim: false;
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  confidence: null;
  monetaryValue: null;
  notificationAuthority: "NONE";
  providerWriteAuthority: "NONE";
}>;

export type SocialMaterialMovementReviewInputV1 = Readonly<{
  evaluatedAt: string;
  historyReview: SocialHistoryComparabilityReviewV1;
  policy: SocialMaterialMovementPolicyV1;
}>;

export type SocialMaterialMovementReviewV1 = Readonly<{
  contractVersion: typeof SOCIAL_MATERIAL_MOVEMENT_REVIEW_V1_VERSION;
  evaluatedAt: string;
  snapshotId: string;
  platform: SocialHistoryComparabilityReviewV1["platform"];
  accountId: string;
  status: "READY" | "VERIFY_REQUIRED" | "INSUFFICIENT_EVIDENCE";
  reasons: readonly SocialMaterialMovementReasonV1[];
  movements: readonly SocialMaterialMovementItemV1[];
  candidates: readonly SocialMaterialMovementItemV1[];
  evidenceRefs: readonly string[];
  comparisonTruthPreserved: true;
  crossPlatformAggregationPerformed: false;
  crossMetricRankingPerformed: false;
  statisticalAnomalyClaim: false;
  causalClaim: false;
  attributionClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  confidence: null;
  monetaryValue: null;
  recommendationAuthority: "NONE";
  notificationAuthority: "NONE";
  postingAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

const SUPPORTED_WINDOWS = new Set<SocialHistoryWindowV1>(["7D", "30D", "90D", "12M"]);
const SUPPORTED_METRICS = new Set<SocialMetricKeyV1>(SOCIAL_METRIC_KEYS_V1);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty`);
  return value.trim();
}

function requireIso(value: unknown, field: string): string {
  const normalized = nonEmpty(value, field);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function finitePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`);
  }
  return value;
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function nearlyEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 32 * scale;
}

function normalizePolicy(policy: SocialMaterialMovementPolicyV1): SocialMaterialMovementPolicyV1 {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy must be an object");
  const maxUpstreamAgeHours = finitePositive(policy.maxUpstreamAgeHours, "policy.maxUpstreamAgeHours");
  if (!Array.isArray(policy.windows) || !policy.windows.length) throw new Error("policy.windows must be a non-empty array");
  if (!Array.isArray(policy.metricRules) || !policy.metricRules.length) throw new Error("policy.metricRules must be a non-empty array");

  const windows = [...new Set(policy.windows.map((window) => {
    if (!SUPPORTED_WINDOWS.has(window)) throw new Error(`unsupported policy window: ${String(window)}`);
    return window;
  }))];

  const seenMetrics = new Set<SocialMetricKeyV1>();
  const metricRules = policy.metricRules.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`policy.metricRules[${index}] must be an object`);
    if (!SUPPORTED_METRICS.has(rule.metric)) throw new Error(`unsupported policy metric: ${String(rule.metric)}`);
    if (seenMetrics.has(rule.metric)) throw new Error(`duplicate policy metric rule: ${rule.metric}`);
    seenMetrics.add(rule.metric);
    return deepFreeze({
      metric: rule.metric,
      minimumAbsolutePercentageDelta: finitePositive(
        rule.minimumAbsolutePercentageDelta,
        `policy.metricRules[${index}].minimumAbsolutePercentageDelta`
      ),
      minimumPriorValue: finiteNonNegative(rule.minimumPriorValue, `policy.metricRules[${index}].minimumPriorValue`)
    });
  });

  return deepFreeze({ maxUpstreamAgeHours, windows, metricRules });
}

function upstreamTruthIsNarrow(review: SocialHistoryComparabilityReviewV1): boolean {
  return review.contractVersion === "SocialHistoryComparabilityReviewV1" &&
    review.comparisonTruthPreserved === true &&
    review.crossPlatformAggregationPerformed === false &&
    review.causalAttributionClaimed === false &&
    review.externalAccessPerformed === false &&
    review.writesPerformed === false;
}

function validateReadyWindowBinding(review: SocialHistoryComparabilityReviewV1): boolean {
  const ready = review.windows.filter((window) => window.state === "READY").map((window) => window.window).sort();
  const declared = [...review.decisionGradeWindows].sort();
  return JSON.stringify(ready) === JSON.stringify(declared);
}

function exactWindow(
  review: SocialHistoryComparabilityReviewV1,
  window: SocialHistoryWindowV1
): SocialHistoryWindowComparabilityV1 | null {
  const matches = review.windows.filter((candidate) => candidate.window === window);
  if (matches.length > 1) throw new Error(`duplicate history window: ${window}`);
  return matches[0] ?? null;
}

function exactMetric(
  window: SocialHistoryWindowComparabilityV1,
  metric: SocialMetricKeyV1
): SocialHistoryMetricComparabilityV1 | null {
  const matches = window.metrics.filter((candidate) => candidate.key === metric);
  if (matches.length > 1) throw new Error(`duplicate history metric: ${window.window}/${metric}`);
  return matches[0] ?? null;
}

function metricBindingValid(metric: SocialHistoryMetricComparabilityV1): boolean {
  if (metric.state !== "READY" || metric.decisionGrade !== true) return false;
  if (metric.currentValue == null || metric.priorValue == null || metric.absoluteDelta == null) return false;
  if (!Number.isFinite(metric.currentValue) || metric.currentValue < 0) return false;
  if (!Number.isFinite(metric.priorValue) || metric.priorValue < 0) return false;
  if (!Number.isFinite(metric.absoluteDelta)) return false;
  if (!metric.evidenceRefs.length || unique(metric.evidenceRefs).length !== metric.evidenceRefs.length) return false;
  return true;
}

function deltaBindingValid(metric: SocialHistoryMetricComparabilityV1): boolean {
  if (metric.currentValue == null || metric.priorValue == null || metric.absoluteDelta == null) return false;
  const expectedAbsolute = metric.currentValue - metric.priorValue;
  if (!nearlyEqual(metric.absoluteDelta, expectedAbsolute)) return false;
  const expectedPercentage = metric.priorValue === 0 ? null : (expectedAbsolute / metric.priorValue) * 100;
  if (expectedPercentage == null) return metric.percentageDelta == null;
  return metric.percentageDelta != null && Number.isFinite(metric.percentageDelta) && nearlyEqual(metric.percentageDelta, expectedPercentage);
}

function evaluateMetric(
  review: SocialHistoryComparabilityReviewV1,
  window: SocialHistoryWindowComparabilityV1,
  metric: SocialHistoryMetricComparabilityV1,
  rule: SocialMaterialMovementMetricRuleV1
): SocialMaterialMovementItemV1 {
  const currentValue = metric.currentValue!;
  const priorValue = metric.priorValue!;
  const absoluteDelta = metric.absoluteDelta!;
  const percentageDelta = metric.percentageDelta;
  const direction: SocialMaterialMovementDirectionV1 = absoluteDelta > 0 ? "INCREASE" : absoluteDelta < 0 ? "DECREASE" : "FLAT";

  let classification: SocialMaterialMovementClassificationV1;
  if (priorValue === 0 || percentageDelta == null) classification = "UNRESOLVED_ZERO_PRIOR_BASELINE";
  else if (priorValue < rule.minimumPriorValue) classification = "BELOW_CALLER_MINIMUM_PRIOR_BASELINE";
  else if (Math.abs(percentageDelta) >= rule.minimumAbsolutePercentageDelta) classification = "MATERIAL_MOVEMENT_REVIEW_CANDIDATE";
  else classification = "BELOW_CALLER_THRESHOLD";

  return deepFreeze({
    snapshotId: review.snapshotId,
    platform: review.platform,
    accountId: review.accountId,
    window: window.window,
    metric: metric.key,
    currentPeriodId: window.currentPeriodId!,
    priorPeriodId: window.priorPeriodId!,
    currentValue,
    priorValue,
    absoluteDelta,
    percentageDelta,
    direction,
    minimumAbsolutePercentageDelta: rule.minimumAbsolutePercentageDelta,
    minimumPriorValue: rule.minimumPriorValue,
    classification,
    alertReviewCandidate: classification === "MATERIAL_MOVEMENT_REVIEW_CANDIDATE",
    evidenceRefs: unique(metric.evidenceRefs),
    statisticalAnomalyClaim: false as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    confidence: null,
    monetaryValue: null,
    notificationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const
  });
}

function emptyReview(
  input: SocialMaterialMovementReviewInputV1,
  evaluatedAt: string,
  status: "VERIFY_REQUIRED" | "INSUFFICIENT_EVIDENCE",
  reasons: readonly SocialMaterialMovementReasonV1[]
): SocialMaterialMovementReviewV1 {
  return deepFreeze({
    contractVersion: SOCIAL_MATERIAL_MOVEMENT_REVIEW_V1_VERSION,
    evaluatedAt,
    snapshotId: nonEmpty(input.historyReview.snapshotId, "historyReview.snapshotId"),
    platform: input.historyReview.platform,
    accountId: nonEmpty(input.historyReview.accountId, "historyReview.accountId"),
    status,
    reasons: [...new Set(reasons)].sort((a, b) => a.localeCompare(b)),
    movements: [],
    candidates: [],
    evidenceRefs: [],
    comparisonTruthPreserved: true as const,
    crossPlatformAggregationPerformed: false as const,
    crossMetricRankingPerformed: false as const,
    statisticalAnomalyClaim: false as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    confidence: null,
    monetaryValue: null,
    recommendationAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "A material movement candidate is an observed first-party comparison that crossed a caller-owned threshold, not a statistical anomaly or causal explanation.",
      "Movements are evaluated only within one exact platform, account, metric, and named comparable history window; unlike metrics and platforms are not ranked or aggregated.",
      "This contract authorizes no recommendation execution, notification, posting, paid amplification, provider write, or other external action."
    ]
  });
}

export function compileSocialMaterialMovementReviewV1(
  input: SocialMaterialMovementReviewInputV1
): SocialMaterialMovementReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const evaluatedAt = requireIso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = normalizePolicy(input.policy);
  const review = input.historyReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) throw new Error("historyReview must be an object");

  const reasons = new Set<SocialMaterialMovementReasonV1>();
  if (!review.sourceDecisionGrade || !review.connectorProofBound) reasons.add("UPSTREAM_NOT_DECISION_GRADE");
  if (!upstreamTruthIsNarrow(review)) reasons.add("UPSTREAM_TRUTH_WIDENED");
  if (!validateReadyWindowBinding(review)) reasons.add("UPSTREAM_WINDOW_BINDING_MISMATCH");

  const upstreamAtMs = Date.parse(review.evaluatedAt);
  if (!Number.isFinite(upstreamAtMs) || upstreamAtMs > evaluatedAtMs) reasons.add("UPSTREAM_FROM_FUTURE");
  else if (evaluatedAtMs - upstreamAtMs > policy.maxUpstreamAgeHours * 3_600_000) reasons.add("UPSTREAM_TOO_OLD");

  if (reasons.size) return emptyReview(input, evaluatedAt, "VERIFY_REQUIRED", [...reasons]);

  const movements: SocialMaterialMovementItemV1[] = [];
  for (const windowKey of policy.windows) {
    const window = exactWindow(review, windowKey);
    if (!window || window.state !== "READY" || !review.decisionGradeWindows.includes(windowKey) ||
        !window.currentPeriodId || !window.priorPeriodId || window.contiguous !== true || window.namedWindowDurationsValid !== true) {
      reasons.add("REQUESTED_WINDOW_NOT_DECISION_GRADE");
      continue;
    }

    for (const rule of policy.metricRules) {
      const metric = exactMetric(window, rule.metric);
      if (!metric || !metricBindingValid(metric) || !window.decisionGradeMetrics.includes(rule.metric)) {
        reasons.add("REQUESTED_METRIC_NOT_DECISION_GRADE");
        continue;
      }
      if (!metric.evidenceRefs.every((ref) => window.evidenceRefs.includes(ref))) {
        reasons.add("EVIDENCE_BINDING_MISMATCH");
        continue;
      }
      if (!deltaBindingValid(metric)) {
        reasons.add("DELTA_BINDING_MISMATCH");
        continue;
      }
      movements.push(evaluateMetric(review, window, metric, rule));
    }
  }

  if (reasons.size) return emptyReview(input, evaluatedAt, "VERIFY_REQUIRED", [...reasons]);
  if (!movements.length) return emptyReview(input, evaluatedAt, "INSUFFICIENT_EVIDENCE", ["NO_EVALUABLE_MOVEMENTS"]);

  const ordered = [...movements].sort((a, b) =>
    policy.windows.indexOf(a.window) - policy.windows.indexOf(b.window) ||
    a.metric.localeCompare(b.metric)
  );
  const candidates = ordered.filter((item) => item.alertReviewCandidate);

  return deepFreeze({
    contractVersion: SOCIAL_MATERIAL_MOVEMENT_REVIEW_V1_VERSION,
    evaluatedAt,
    snapshotId: review.snapshotId,
    platform: review.platform,
    accountId: review.accountId,
    status: "READY" as const,
    reasons: [],
    movements: ordered,
    candidates,
    evidenceRefs: unique(ordered.flatMap((item) => item.evidenceRefs)),
    comparisonTruthPreserved: true as const,
    crossPlatformAggregationPerformed: false as const,
    crossMetricRankingPerformed: false as const,
    statisticalAnomalyClaim: false as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    confidence: null,
    monetaryValue: null,
    recommendationAuthority: "NONE" as const,
    notificationAuthority: "NONE" as const,
    postingAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "A material movement candidate is an observed first-party comparison that crossed a caller-owned threshold, not a statistical anomaly or causal explanation.",
      "Movements are evaluated only within one exact platform, account, metric, and named comparable history window; unlike metrics and platforms are not ranked or aggregated.",
      "Zero prior baselines remain unresolved rather than producing infinite percentage changes.",
      "No attribution, confidence, monetary value, competitor performance, endorsement, or relationship is inferred.",
      "This contract authorizes no recommendation execution, notification, posting, paid amplification, provider write, or other external action."
    ]
  });
}

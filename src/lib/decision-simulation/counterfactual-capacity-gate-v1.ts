import { createHash } from "node:crypto";

import {
  COUNTERFACTUAL_REVIEW_POLICY_VERSION_V1,
  type CounterfactualReviewV1,
  type CounterfactualTruthStateV1
} from "./counterfactual-review-v1";

export const COUNTERFACTUAL_CAPACITY_GATE_VERSION_V1 =
  "CounterfactualCapacityGateV1" as const;
export const COUNTERFACTUAL_CAPACITY_GATE_POLICY_VERSION_V1 =
  "counterfactual_capacity_gate_v1.0.0" as const;

const MAX_RESOURCES = 200;
const MAX_REFS = 2_000;
const MAX_SCENARIOS = 50;
const MAX_TEXT = 512;

export type CapacityResourceObservationV1 = Readonly<{
  resourceRef: string;
  label: string;
  availableAmount: number | null;
  unit: string;
  truthState: CounterfactualTruthStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type CapacitySnapshotV1 = Readonly<{
  snapshotId: string;
  observedAt: string;
  truthState: CounterfactualTruthStateV1;
  resources: readonly CapacityResourceObservationV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type CounterfactualCapacityResourceLaneV1 =
  | "WITHIN_KNOWN_CAPACITY"
  | "EXCEEDS_KNOWN_CAPACITY"
  | "VERIFY_DEMAND"
  | "VERIFY_CAPACITY";

export type CounterfactualCapacityScenarioLaneV1 =
  | "FEASIBLE_UNDER_KNOWN_CAPACITY"
  | "BLOCKED_BY_KNOWN_CAPACITY"
  | "VERIFY_RESOURCE_EVIDENCE"
  | "NO_RECORDED_RESOURCE_DEMANDS";

export type CounterfactualCapacityGateStateV1 =
  | "READY_FOR_RESOURCE_COMPARISON"
  | "VERIFY_COUNTERFACTUAL"
  | "VERIFY_CAPACITY"
  | "BLOCKED_NO_FEASIBLE_SCENARIO"
  | "NO_RESOURCE_SCOPE";

export type CounterfactualCapacityReasonV1 =
  | "COUNTERFACTUAL_CONTRACT_INVALID"
  | "COUNTERFACTUAL_POLICY_INVALID"
  | "COUNTERFACTUAL_AUTHORITY_INVALID"
  | "COUNTERFACTUAL_NOT_COMPARISON_READY"
  | "COUNTERFACTUAL_HAS_VERIFICATION_REASONS"
  | "COUNTERFACTUAL_HAS_BLOCKER_REASONS"
  | "COUNTERFACTUAL_HAS_MISSING_DIMENSIONS"
  | "COUNTERFACTUAL_TIMESTAMP_INVALID"
  | "COUNTERFACTUAL_FUTURE_DATED"
  | "COUNTERFACTUAL_STALE"
  | "COUNTERFACTUAL_SCENARIO_INVALID"
  | "CAPACITY_SNAPSHOT_ID_INVALID"
  | "CAPACITY_TIMESTAMP_INVALID"
  | "CAPACITY_FUTURE_DATED"
  | "CAPACITY_STALE"
  | "CAPACITY_SNAPSHOT_TRUTH_NOT_KNOWN"
  | "CAPACITY_SNAPSHOT_PROVENANCE_REQUIRED"
  | "CAPACITY_RESOURCE_DUPLICATE"
  | "CAPACITY_RESOURCE_INVALID"
  | "CAPACITY_RESOURCE_TRUTH_NOT_KNOWN"
  | "CAPACITY_RESOURCE_AMOUNT_REQUIRED"
  | "CAPACITY_RESOURCE_AMOUNT_INVALID"
  | "CAPACITY_RESOURCE_PROVENANCE_REQUIRED"
  | "DEMAND_RESOURCE_MISSING"
  | "DEMAND_TRUTH_NOT_KNOWN"
  | "DEMAND_AMOUNT_REQUIRED"
  | "DEMAND_AMOUNT_INVALID"
  | "DEMAND_EVIDENCE_REQUIRED"
  | "RESOURCE_UNIT_MISMATCH"
  | "KNOWN_CAPACITY_EXCEEDED"
  | "KNOWN_CAPACITY_AVAILABLE"
  | "NO_RECORDED_RESOURCE_DEMANDS";

export type CounterfactualCapacityResourceCheckV1 = Readonly<{
  resourceRef: string;
  resourceLabel: string;
  demandAmount: number | null;
  demandUnit: string;
  demandTruthState: CounterfactualTruthStateV1;
  availableAmount: number | null;
  capacityUnit: string | null;
  capacityTruthState: CounterfactualTruthStateV1 | null;
  lane: CounterfactualCapacityResourceLaneV1;
  reasons: readonly CounterfactualCapacityReasonV1[];
  demandEvidenceRefs: readonly string[];
  capacityEvidenceRefs: readonly string[];
  capacitySourceRefs: readonly string[];
  arithmeticComparisonOnly: true;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CounterfactualCapacityScenarioCheckV1 = Readonly<{
  scenarioId: string;
  scenarioClass: string;
  lane: CounterfactualCapacityScenarioLaneV1;
  resourceChecks: readonly CounterfactualCapacityResourceCheckV1[];
  reasons: readonly CounterfactualCapacityReasonV1[];
  winnerSelected: false;
  allocationRecommended: false;
  expectedValue: null;
  opportunityCost: null;
  confidence: "NOT_ESTABLISHED";
}>;

export type CounterfactualCapacityGateV1 = Readonly<{
  contractVersion: typeof COUNTERFACTUAL_CAPACITY_GATE_VERSION_V1;
  policyVersion: typeof COUNTERFACTUAL_CAPACITY_GATE_POLICY_VERSION_V1;
  gateId: string;
  state: CounterfactualCapacityGateStateV1;
  generatedAt: string;
  sourceReviewId: string | null;
  sourceDecisionId: string | null;
  sourceReviewEvaluatedAt: string | null;
  sourceCapacitySnapshotId: string | null;
  sourceCapacityObservedAt: string | null;
  maximumReviewAgeMs: number;
  maximumCapacityAgeMs: number;
  reasons: readonly CounterfactualCapacityReasonV1[];
  scenarioChecks: readonly CounterfactualCapacityScenarioCheckV1[];
  feasibleScenarioIds: readonly string[];
  capacityBlockedScenarioIds: readonly string[];
  verificationScenarioIds: readonly string[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  winnerSelected: false;
  allocationRecommended: false;
  allocationMutationAuthorized: false;
  spendAuthorized: false;
  pricingChangeAuthorized: false;
  experimentLaunchAuthorized: false;
  externalActionAuthorized: false;
  approvalBypassAuthorized: false;
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  expectedValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
}>;

export type CounterfactualCapacityGateInputV1 = Readonly<{
  review: CounterfactualReviewV1;
  capacitySnapshot: CapacitySnapshotV1;
  generatedAt: string;
  maximumReviewAgeMs: number;
  maximumCapacityAgeMs: number;
}>;

export class CounterfactualCapacityGateError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CounterfactualCapacityGateError";
  }
}

const EXPECTED_REVIEW_AUTHORITY = Object.freeze({
  analysisOnly: true,
  scenarioSelectionAuthorized: false,
  allocationMutationAuthorized: false,
  experimentLaunchAuthorized: false,
  externalActionAuthorized: false,
  spendAuthorized: false,
  pricingChangeAuthorized: false,
  contractAuthorized: false,
  outreachAuthorized: false,
  publishAuthorized: false,
  approvalBypassAuthorized: false,
  causalAttributionAuthorized: false
});

const TRUTH_STATES = new Set<CounterfactualTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "PARTIAL",
  "CONFLICTED"
]);

const LIMITATIONS = Object.freeze([
  "This gate checks only arithmetic resource feasibility against explicit, fresh, KNOWN capacity observations. It does not select or recommend a scenario.",
  "A scenario marked FEASIBLE_UNDER_KNOWN_CAPACITY is only within the recorded resource ceilings. That label is not evidence that the scenario is strategically preferable, profitable, safe, or likely to succeed.",
  "A scenario marked BLOCKED_BY_KNOWN_CAPACITY exceeds at least one recorded resource ceiling using exact same-unit arithmetic. It is not a causal claim and does not authorize reallocation.",
  "Unknown, inferred, stale, partial, conflicted, missing, duplicate, future-dated, unit-mismatched, or provenance-free resource evidence fails closed to verification.",
  "No expected value, opportunity cost, confidence, monetary value, outcome, allocation, spend, pricing, experiment, approval bypass, or external action is invented or authorized."
] as const);

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value, 128);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function boundedUniqueRefs(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_REFS) return null;
  const normalized: string[] = [];
  for (const candidate of value) {
    const ref = text(candidate, 512);
    if (!ref) return null;
    normalized.push(ref);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactReviewAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const expected = EXPECTED_REVIEW_AUTHORITY as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function stableId(parts: readonly string[]): string {
  return `counterfactual-capacity:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

type NormalizedCapacityResource = Readonly<{
  resourceRef: string;
  label: string;
  availableAmount: number | null;
  unit: string;
  truthState: CounterfactualTruthStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  reasons: readonly CounterfactualCapacityReasonV1[];
}>;

type NormalizedCapacitySnapshot = Readonly<{
  snapshotId: string | null;
  observedAt: string | null;
  resources: readonly NormalizedCapacityResource[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  reasons: readonly CounterfactualCapacityReasonV1[];
}>;

function normalizeCapacitySnapshot(
  snapshot: CapacitySnapshotV1,
  generatedAtMs: number,
  maximumCapacityAgeMs: number
): NormalizedCapacitySnapshot {
  const reasons = new Set<CounterfactualCapacityReasonV1>();
  const snapshotId = text(snapshot?.snapshotId, 256);
  const observedAt = canonicalTimestamp(snapshot?.observedAt);
  const snapshotEvidenceRefs = boundedUniqueRefs(snapshot?.evidenceRefs);
  const snapshotSourceRefs = boundedUniqueRefs(snapshot?.sourceRefs);

  if (!snapshotId) reasons.add("CAPACITY_SNAPSHOT_ID_INVALID");
  if (!observedAt) {
    reasons.add("CAPACITY_TIMESTAMP_INVALID");
  } else {
    const observedAtMs = Date.parse(observedAt);
    if (observedAtMs > generatedAtMs) reasons.add("CAPACITY_FUTURE_DATED");
    if (generatedAtMs - observedAtMs > maximumCapacityAgeMs) reasons.add("CAPACITY_STALE");
  }
  if (snapshot?.truthState !== "KNOWN") reasons.add("CAPACITY_SNAPSHOT_TRUTH_NOT_KNOWN");
  if (
    !snapshotEvidenceRefs
    || snapshotEvidenceRefs.length === 0
    || !snapshotSourceRefs
    || snapshotSourceRefs.length === 0
  ) {
    reasons.add("CAPACITY_SNAPSHOT_PROVENANCE_REQUIRED");
  }

  if (!Array.isArray(snapshot?.resources) || snapshot.resources.length > MAX_RESOURCES) {
    throw new CounterfactualCapacityGateError(
      "INVALID_CAPACITY_RESOURCES",
      `capacity resources must be an array with at most ${MAX_RESOURCES} entries`
    );
  }

  const seen = new Set<string>();
  const resources: NormalizedCapacityResource[] = [];
  for (const raw of snapshot.resources) {
    const resourceReasons = new Set<CounterfactualCapacityReasonV1>();
    const resourceRef = text(raw?.resourceRef, 256);
    const label = text(raw?.label, 256);
    const unit = text(raw?.unit, 64);
    const availableAmount = raw?.availableAmount == null
      ? null
      : nonNegativeFinite(raw.availableAmount);
    const truthState = TRUTH_STATES.has(raw?.truthState) ? raw.truthState : "UNKNOWN";
    const evidenceRefs = boundedUniqueRefs(raw?.evidenceRefs);
    const sourceRefs = boundedUniqueRefs(raw?.sourceRefs);

    if (!resourceRef || !label || !unit) resourceReasons.add("CAPACITY_RESOURCE_INVALID");
    if (resourceRef && seen.has(resourceRef)) {
      resourceReasons.add("CAPACITY_RESOURCE_DUPLICATE");
      reasons.add("CAPACITY_RESOURCE_DUPLICATE");
    }
    if (resourceRef) seen.add(resourceRef);
    if (!TRUTH_STATES.has(raw?.truthState)) resourceReasons.add("CAPACITY_RESOURCE_INVALID");
    if (truthState !== "KNOWN") resourceReasons.add("CAPACITY_RESOURCE_TRUTH_NOT_KNOWN");
    if (raw?.availableAmount == null) {
      resourceReasons.add("CAPACITY_RESOURCE_AMOUNT_REQUIRED");
    } else if (availableAmount === null) {
      resourceReasons.add("CAPACITY_RESOURCE_AMOUNT_INVALID");
    }
    if (!evidenceRefs || evidenceRefs.length === 0 || !sourceRefs || sourceRefs.length === 0) {
      resourceReasons.add("CAPACITY_RESOURCE_PROVENANCE_REQUIRED");
    }

    resources.push(Object.freeze({
      resourceRef: resourceRef ?? "INVALID_RESOURCE",
      label: label ?? "Invalid resource",
      availableAmount,
      unit: unit ?? "INVALID_UNIT",
      truthState,
      evidenceRefs: evidenceRefs ?? Object.freeze([]),
      sourceRefs: sourceRefs ?? Object.freeze([]),
      reasons: Object.freeze([...resourceReasons].sort((a, b) => a.localeCompare(b)))
    }));
  }

  resources.sort((a, b) => a.resourceRef.localeCompare(b.resourceRef));
  return Object.freeze({
    snapshotId,
    observedAt,
    resources: Object.freeze(resources),
    evidenceRefs: snapshotEvidenceRefs ?? Object.freeze([]),
    sourceRefs: snapshotSourceRefs ?? Object.freeze([]),
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
  });
}

function reviewReasons(
  review: CounterfactualReviewV1,
  generatedAtMs: number,
  maximumReviewAgeMs: number
): { reasons: readonly CounterfactualCapacityReasonV1[]; evaluatedAt: string | null } {
  const reasons = new Set<CounterfactualCapacityReasonV1>();
  if (review?.contractVersion !== "CounterfactualReviewV1") {
    reasons.add("COUNTERFACTUAL_CONTRACT_INVALID");
  }
  if (review?.policyVersion !== COUNTERFACTUAL_REVIEW_POLICY_VERSION_V1) {
    reasons.add("COUNTERFACTUAL_POLICY_INVALID");
  }
  if (!exactReviewAuthority(review?.actionAuthority)) {
    reasons.add("COUNTERFACTUAL_AUTHORITY_INVALID");
  }
  if (review?.status !== "COMPARISON_READY") {
    reasons.add("COUNTERFACTUAL_NOT_COMPARISON_READY");
  }
  if (!Array.isArray(review?.verificationReasons) || review.verificationReasons.length > 0) {
    reasons.add("COUNTERFACTUAL_HAS_VERIFICATION_REASONS");
  }
  if (!Array.isArray(review?.blockerReasons) || review.blockerReasons.length > 0) {
    reasons.add("COUNTERFACTUAL_HAS_BLOCKER_REASONS");
  }
  if (!Array.isArray(review?.missingComparisonDimensions) || review.missingComparisonDimensions.length > 0) {
    reasons.add("COUNTERFACTUAL_HAS_MISSING_DIMENSIONS");
  }
  if (!Array.isArray(review?.scenarios) || review.scenarios.length < 2 || review.scenarios.length > MAX_SCENARIOS) {
    reasons.add("COUNTERFACTUAL_SCENARIO_INVALID");
  } else {
    const ids = new Set<string>();
    for (const scenario of review.scenarios) {
      const scenarioId = text(scenario?.scenarioId, 256);
      if (!scenarioId || ids.has(scenarioId) || scenario.disposition !== "COMPARABLE") {
        reasons.add("COUNTERFACTUAL_SCENARIO_INVALID");
      }
      if (scenarioId) ids.add(scenarioId);
    }
  }

  const evaluatedAt = canonicalTimestamp(review?.evaluatedAt);
  if (!evaluatedAt) {
    reasons.add("COUNTERFACTUAL_TIMESTAMP_INVALID");
  } else {
    const evaluatedAtMs = Date.parse(evaluatedAt);
    if (evaluatedAtMs > generatedAtMs) reasons.add("COUNTERFACTUAL_FUTURE_DATED");
    if (generatedAtMs - evaluatedAtMs > maximumReviewAgeMs) reasons.add("COUNTERFACTUAL_STALE");
  }
  return {
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    evaluatedAt
  };
}

function resourceCheck(
  demand: CounterfactualReviewV1["scenarios"][number]["resourceDemands"][number],
  capacityResources: readonly NormalizedCapacityResource[]
): CounterfactualCapacityResourceCheckV1 {
  const reasons = new Set<CounterfactualCapacityReasonV1>();
  const resourceRef = text(demand?.resourceRef, 256) ?? "INVALID_RESOURCE";
  const resourceLabel = text(demand?.label, 256) ?? "Invalid resource";
  const demandUnit = text(demand?.unit, 64) ?? "INVALID_UNIT";
  const demandEvidenceRefs = boundedUniqueRefs(demand?.evidenceRefs) ?? Object.freeze([]);
  const demandAmount = demand?.amount == null ? null : nonNegativeFinite(demand.amount);
  const demandTruthState = TRUTH_STATES.has(demand?.truthState) ? demand.truthState : "UNKNOWN";
  const matches = capacityResources.filter((resource) => resource.resourceRef === resourceRef);
  const capacity = matches.length === 1 ? matches[0] : null;

  if (!capacity) reasons.add("DEMAND_RESOURCE_MISSING");
  if (demandTruthState !== "KNOWN") reasons.add("DEMAND_TRUTH_NOT_KNOWN");
  if (demand?.amount == null) {
    reasons.add("DEMAND_AMOUNT_REQUIRED");
  } else if (demandAmount === null) {
    reasons.add("DEMAND_AMOUNT_INVALID");
  }
  if (demandEvidenceRefs.length === 0) reasons.add("DEMAND_EVIDENCE_REQUIRED");

  if (capacity) {
    for (const reason of capacity.reasons) reasons.add(reason);
    if (capacity.unit !== demandUnit) reasons.add("RESOURCE_UNIT_MISMATCH");
  }

  let lane: CounterfactualCapacityResourceLaneV1;
  const demandProblem = [...reasons].some((reason) =>
    reason === "DEMAND_TRUTH_NOT_KNOWN"
    || reason === "DEMAND_AMOUNT_REQUIRED"
    || reason === "DEMAND_AMOUNT_INVALID"
    || reason === "DEMAND_EVIDENCE_REQUIRED"
  );
  const capacityProblem = [...reasons].some((reason) =>
    reason === "DEMAND_RESOURCE_MISSING"
    || reason.startsWith("CAPACITY_")
    || reason === "RESOURCE_UNIT_MISMATCH"
  );

  if (demandProblem) {
    lane = "VERIFY_DEMAND";
  } else if (capacityProblem || !capacity || demandAmount === null || capacity.availableAmount === null) {
    lane = "VERIFY_CAPACITY";
  } else if (demandAmount > capacity.availableAmount) {
    lane = "EXCEEDS_KNOWN_CAPACITY";
    reasons.add("KNOWN_CAPACITY_EXCEEDED");
  } else {
    lane = "WITHIN_KNOWN_CAPACITY";
    reasons.add("KNOWN_CAPACITY_AVAILABLE");
  }

  return deepFreeze({
    resourceRef,
    resourceLabel,
    demandAmount,
    demandUnit,
    demandTruthState,
    availableAmount: capacity?.availableAmount ?? null,
    capacityUnit: capacity?.unit ?? null,
    capacityTruthState: capacity?.truthState ?? null,
    lane,
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    demandEvidenceRefs: Object.freeze([...demandEvidenceRefs]),
    capacityEvidenceRefs: Object.freeze([...(capacity?.evidenceRefs ?? [])]),
    capacitySourceRefs: Object.freeze([...(capacity?.sourceRefs ?? [])]),
    arithmeticComparisonOnly: true as const,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  });
}

function scenarioCheck(
  scenario: CounterfactualReviewV1["scenarios"][number],
  capacityResources: readonly NormalizedCapacityResource[]
): CounterfactualCapacityScenarioCheckV1 {
  const demands = Array.isArray(scenario.resourceDemands) ? scenario.resourceDemands : [];
  const resourceChecks = demands.map((demand) => resourceCheck(demand, capacityResources));
  const reasons = new Set<CounterfactualCapacityReasonV1>();
  let lane: CounterfactualCapacityScenarioLaneV1;

  if (resourceChecks.length === 0) {
    lane = "NO_RECORDED_RESOURCE_DEMANDS";
    reasons.add("NO_RECORDED_RESOURCE_DEMANDS");
  } else if (resourceChecks.some((check) => check.lane === "VERIFY_DEMAND" || check.lane === "VERIFY_CAPACITY")) {
    lane = "VERIFY_RESOURCE_EVIDENCE";
    for (const check of resourceChecks) {
      if (check.lane === "VERIFY_DEMAND" || check.lane === "VERIFY_CAPACITY") {
        for (const reason of check.reasons) reasons.add(reason);
      }
    }
  } else if (resourceChecks.some((check) => check.lane === "EXCEEDS_KNOWN_CAPACITY")) {
    lane = "BLOCKED_BY_KNOWN_CAPACITY";
    reasons.add("KNOWN_CAPACITY_EXCEEDED");
  } else {
    lane = "FEASIBLE_UNDER_KNOWN_CAPACITY";
    reasons.add("KNOWN_CAPACITY_AVAILABLE");
  }

  return deepFreeze({
    scenarioId: String(scenario.scenarioId),
    scenarioClass: String(scenario.scenarioClass),
    lane,
    resourceChecks: Object.freeze(resourceChecks),
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    winnerSelected: false as const,
    allocationRecommended: false as const,
    expectedValue: null,
    opportunityCost: null,
    confidence: "NOT_ESTABLISHED" as const
  });
}

export function compileCounterfactualCapacityGateV1(
  input: CounterfactualCapacityGateInputV1
): CounterfactualCapacityGateV1 {
  if (!input || !input.review || !input.capacitySnapshot) {
    throw new CounterfactualCapacityGateError(
      "INVALID_INPUT",
      "review and capacitySnapshot are required"
    );
  }
  const generatedAt = canonicalTimestamp(input.generatedAt);
  const maximumReviewAgeMs = positiveFinite(input.maximumReviewAgeMs);
  const maximumCapacityAgeMs = positiveFinite(input.maximumCapacityAgeMs);
  if (!generatedAt || !maximumReviewAgeMs || !maximumCapacityAgeMs) {
    throw new CounterfactualCapacityGateError(
      "INVALID_FRESHNESS_WINDOW",
      "generatedAt must be canonical ISO and freshness windows must be positive finite milliseconds"
    );
  }
  const generatedAtMs = Date.parse(generatedAt);
  const reviewValidation = reviewReasons(input.review, generatedAtMs, maximumReviewAgeMs);
  const capacity = normalizeCapacitySnapshot(
    input.capacitySnapshot,
    generatedAtMs,
    maximumCapacityAgeMs
  );

  const globalReasons = new Set<CounterfactualCapacityReasonV1>([
    ...reviewValidation.reasons,
    ...capacity.reasons
  ]);

  let scenarioChecks: readonly CounterfactualCapacityScenarioCheckV1[] = Object.freeze([]);
  if (reviewValidation.reasons.length === 0 && capacity.reasons.length === 0) {
    scenarioChecks = Object.freeze(
      input.review.scenarios
        .map((scenario) => scenarioCheck(scenario, capacity.resources))
        .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId))
    );
  }

  const feasibleScenarioIds = Object.freeze(
    scenarioChecks
      .filter((scenario) => scenario.lane === "FEASIBLE_UNDER_KNOWN_CAPACITY")
      .map((scenario) => scenario.scenarioId)
      .sort((a, b) => a.localeCompare(b))
  );
  const capacityBlockedScenarioIds = Object.freeze(
    scenarioChecks
      .filter((scenario) => scenario.lane === "BLOCKED_BY_KNOWN_CAPACITY")
      .map((scenario) => scenario.scenarioId)
      .sort((a, b) => a.localeCompare(b))
  );
  const verificationScenarioIds = Object.freeze(
    scenarioChecks
      .filter((scenario) => scenario.lane === "VERIFY_RESOURCE_EVIDENCE")
      .map((scenario) => scenario.scenarioId)
      .sort((a, b) => a.localeCompare(b))
  );
  const noResourceScope = scenarioChecks.length > 0
    && scenarioChecks.every((scenario) => scenario.lane === "NO_RECORDED_RESOURCE_DEMANDS");

  let state: CounterfactualCapacityGateStateV1;
  if (reviewValidation.reasons.length > 0) {
    state = "VERIFY_COUNTERFACTUAL";
  } else if (capacity.reasons.length > 0 || verificationScenarioIds.length > 0) {
    state = "VERIFY_CAPACITY";
  } else if (noResourceScope) {
    state = "NO_RESOURCE_SCOPE";
  } else if (feasibleScenarioIds.length === 0 && capacityBlockedScenarioIds.length > 0) {
    state = "BLOCKED_NO_FEASIBLE_SCENARIO";
  } else {
    state = "READY_FOR_RESOURCE_COMPARISON";
  }

  for (const scenario of scenarioChecks) {
    for (const reason of scenario.reasons) globalReasons.add(reason);
  }

  const evidenceRefs = Object.freeze([
    ...new Set([
      ...capacity.evidenceRefs,
      ...capacity.resources.flatMap((resource) => resource.evidenceRefs),
      ...scenarioChecks.flatMap((scenario) =>
        scenario.resourceChecks.flatMap((check) => check.demandEvidenceRefs)
      )
    ])
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set([
      ...capacity.sourceRefs,
      ...capacity.resources.flatMap((resource) => resource.sourceRefs)
    ])
  ].sort((a, b) => a.localeCompare(b)));

  return deepFreeze({
    contractVersion: COUNTERFACTUAL_CAPACITY_GATE_VERSION_V1,
    policyVersion: COUNTERFACTUAL_CAPACITY_GATE_POLICY_VERSION_V1,
    gateId: stableId([
      generatedAt,
      input.review.reviewId ?? "INVALID_REVIEW",
      capacity.snapshotId ?? "INVALID_CAPACITY",
      ...scenarioChecks.map((scenario) => `${scenario.scenarioId}:${scenario.lane}`)
    ]),
    state,
    generatedAt,
    sourceReviewId: text(input.review.reviewId, 256),
    sourceDecisionId: text(input.review.decisionId, 256),
    sourceReviewEvaluatedAt: reviewValidation.evaluatedAt,
    sourceCapacitySnapshotId: capacity.snapshotId,
    sourceCapacityObservedAt: capacity.observedAt,
    maximumReviewAgeMs,
    maximumCapacityAgeMs,
    reasons: Object.freeze([...globalReasons].sort((a, b) => a.localeCompare(b))),
    scenarioChecks,
    feasibleScenarioIds,
    capacityBlockedScenarioIds,
    verificationScenarioIds,
    evidenceRefs,
    sourceRefs,
    winnerSelected: false as const,
    allocationRecommended: false as const,
    allocationMutationAuthorized: false as const,
    spendAuthorized: false as const,
    pricingChangeAuthorized: false as const,
    experimentLaunchAuthorized: false as const,
    externalActionAuthorized: false as const,
    approvalBypassAuthorized: false as const,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    expectedValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS
  });
}

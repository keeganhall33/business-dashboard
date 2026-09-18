import { createHash } from "node:crypto";

export const COUNTERFACTUAL_REVIEW_POLICY_VERSION_V1 =
  "counterfactual_review_v1.0.0" as const;

export type CounterfactualTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "PARTIAL"
  | "CONFLICTED";

export type CounterfactualScenarioClassV1 =
  | "DO"
  | "DO_NOT"
  | "DELAY"
  | "ALTERNATIVE";

export type CounterfactualEvidenceBasisV1 =
  | "OBSERVED"
  | "MODELLED"
  | "ASSUMPTION";

export type CounterfactualDimensionKindV1 =
  | "MONETARY"
  | "CAPACITY"
  | "TIMING"
  | "RELATIONSHIP"
  | "RIGHTS"
  | "RISK"
  | "PRESTIGE"
  | "DISTRIBUTION"
  | "STRATEGIC_OPTION"
  | "CUSTOM";

export type CounterfactualReviewStatusV1 =
  | "COMPARISON_READY"
  | "VERIFY_REQUIRED"
  | "BLOCKED";

export type CounterfactualScenarioDispositionV1 =
  | "COMPARABLE"
  | "VERIFY_REQUIRED"
  | "BLOCKED";

export type CounterfactualApprovalClassV1 =
  | "NONE"
  | "REVIEW"
  | "KEEGAN"
  | "UNKNOWN";

export type CounterfactualRangeV1 = {
  min: number;
  max: number;
  unit: string;
};

export type CounterfactualWindowV1 = {
  start: string;
  end: string;
};

export type CounterfactualDimensionInputV1 = {
  dimensionRef: string;
  label: string;
  kind: CounterfactualDimensionKindV1;
  material: boolean;
  basis: CounterfactualEvidenceBasisV1;
  truthState: CounterfactualTruthStateV1;
  range: CounterfactualRangeV1 | null;
  qualitativeValue: string | null;
  window: CounterfactualWindowV1 | null;
  evidenceRefs: readonly string[];
};

export type CounterfactualAssumptionInputV1 = {
  assumptionId: string;
  statement: string;
  material: boolean;
  evidenceRefs: readonly string[];
};

export type CounterfactualResourceDemandInputV1 = {
  resourceRef: string;
  label: string;
  amount: number | null;
  unit: string;
  truthState: CounterfactualTruthStateV1;
  evidenceRefs: readonly string[];
};

export type CounterfactualScenarioInputV1 = {
  scenarioId: string;
  scenarioClass: CounterfactualScenarioClassV1;
  label: string;
  dimensions: readonly CounterfactualDimensionInputV1[];
  assumptions: readonly CounterfactualAssumptionInputV1[];
  resourceDemands: readonly CounterfactualResourceDemandInputV1[];
  reversibility: "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
  approvalClass: CounterfactualApprovalClassV1;
  safeNextStep: string;
};

export type CounterfactualReviewInputV1 = {
  decisionId: string;
  evaluatedAt: string;
  scenarios: readonly CounterfactualScenarioInputV1[];
};

export type CounterfactualDimensionViewV1 = CounterfactualDimensionInputV1 & {
  comparisonEligible: boolean;
  verificationRequired: boolean;
  blockerReason: string | null;
};

export type CounterfactualScenarioViewV1 = Omit<CounterfactualScenarioInputV1, "dimensions"> & {
  dimensions: readonly CounterfactualDimensionViewV1[];
  disposition: CounterfactualScenarioDispositionV1;
  verificationReasons: readonly string[];
  blockerReasons: readonly string[];
};

export type CounterfactualComparisonMemberV1 = {
  scenarioId: string;
  basis: CounterfactualEvidenceBasisV1;
  truthState: CounterfactualTruthStateV1;
  range: CounterfactualRangeV1 | null;
  qualitativeValue: string | null;
  evidenceRefs: readonly string[];
};

export type CounterfactualDimensionComparisonV1 = {
  dimensionRef: string;
  label: string;
  kind: CounterfactualDimensionKindV1;
  window: CounterfactualWindowV1 | null;
  members: readonly CounterfactualComparisonMemberV1[];
  comparisonClass: "DIRECT_EVIDENCE" | "CONDITIONAL_ON_ASSUMPTIONS";
  winnerSelected: false;
  causalClaimMade: false;
  monetaryValueSynthesized: false;
};

export type CounterfactualReviewV1 = {
  contractVersion: "CounterfactualReviewV1";
  policyVersion: typeof COUNTERFACTUAL_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  decisionId: string;
  evaluatedAt: string;
  status: CounterfactualReviewStatusV1;
  scenarios: readonly CounterfactualScenarioViewV1[];
  comparisons: readonly CounterfactualDimensionComparisonV1[];
  verificationReasons: readonly string[];
  blockerReasons: readonly string[];
  missingComparisonDimensions: readonly string[];
  actionAuthority: {
    analysisOnly: true;
    scenarioSelectionAuthorized: false;
    allocationMutationAuthorized: false;
    experimentLaunchAuthorized: false;
    externalActionAuthorized: false;
    spendAuthorized: false;
    pricingChangeAuthorized: false;
    contractAuthorized: false;
    outreachAuthorized: false;
    publishAuthorized: false;
    approvalBypassAuthorized: false;
    causalAttributionAuthorized: false;
  };
};

export class CounterfactualReviewError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CounterfactualReviewError";
  }
}

const MAX_SCENARIOS = 12;
const MAX_DIMENSIONS = 40;
const MAX_ASSUMPTIONS = 50;
const MAX_RESOURCES = 50;
const MAX_REFS = 100;
const MAX_TEXT = 1_000;

function required(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CounterfactualReviewError("REQUIRED_FIELD", `${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new CounterfactualReviewError(
      "BOUNDS_EXCEEDED",
      `${label} exceeds ${max} characters`
    );
  }
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label, 128);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) {
    throw new CounterfactualReviewError(
      "INVALID_TIMESTAMP",
      `${label} must be a valid timestamp`
    );
  }
  return new Date(millis).toISOString();
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new CounterfactualReviewError(
      "BOUNDS_EXCEEDED",
      `${label} exceeds supported bounds`
    );
  }
  return [...new Set(values.map((value) => required(value, label, 256)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function bounded<T>(values: readonly T[], label: string, max: number): readonly T[] {
  if (!Array.isArray(values) || values.length > max) {
    throw new CounterfactualReviewError(
      "BOUNDS_EXCEEDED",
      `${label} exceeds supported bounds`
    );
  }
  return values;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
  );
}

function stableId(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")
    .slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeWindow(
  value: CounterfactualWindowV1 | null,
  label: string
): CounterfactualWindowV1 | null {
  if (value == null) return null;
  const start = timestamp(value.start, `${label}.start`);
  const end = timestamp(value.end, `${label}.end`);
  if (Date.parse(start) > Date.parse(end)) {
    throw new CounterfactualReviewError(
      "INVALID_WINDOW",
      `${label}.start must be before or equal to ${label}.end`
    );
  }
  return { start, end };
}

function normalizeRange(
  value: CounterfactualRangeV1 | null,
  label: string
): CounterfactualRangeV1 | null {
  if (value == null) return null;
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) {
    throw new CounterfactualReviewError(
      "INVALID_RANGE",
      `${label} must contain finite bounds`
    );
  }
  if (value.min > value.max) {
    throw new CounterfactualReviewError(
      "INVALID_RANGE",
      `${label}.min must be <= ${label}.max`
    );
  }
  return {
    min: value.min,
    max: value.max,
    unit: required(value.unit, `${label}.unit`, 64)
  };
}

function normalizeDimension(
  value: CounterfactualDimensionInputV1,
  scenarioId: string
): CounterfactualDimensionViewV1 {
  const dimensionRef = required(value.dimensionRef, "dimension.dimensionRef", 256);
  const label = required(value.label, "dimension.label", 256);
  const evidenceRefs = refs(value.evidenceRefs, "dimension.evidenceRefs");
  const range = normalizeRange(value.range, "dimension.range");
  const qualitativeValue =
    value.qualitativeValue == null
      ? null
      : required(value.qualitativeValue, "dimension.qualitativeValue");
  const window = normalizeWindow(value.window, "dimension.window");

  if (range == null && qualitativeValue == null) {
    throw new CounterfactualReviewError(
      "MISSING_DIMENSION_VALUE",
      `${scenarioId}:${dimensionRef} requires a quantitative range or qualitative value`
    );
  }
  if (range != null && qualitativeValue != null) {
    throw new CounterfactualReviewError(
      "AMBIGUOUS_DIMENSION_VALUE",
      `${scenarioId}:${dimensionRef} cannot mix quantitative and qualitative values`
    );
  }
  if (range != null && window == null) {
    throw new CounterfactualReviewError(
      "MISSING_COMPARISON_WINDOW",
      `${scenarioId}:${dimensionRef} quantitative ranges require an explicit window`
    );
  }
  if (value.basis === "OBSERVED" && evidenceRefs.length === 0) {
    throw new CounterfactualReviewError(
      "MISSING_EVIDENCE",
      `${scenarioId}:${dimensionRef} observed values require evidence`
    );
  }
  if (value.basis === "MODELLED" && evidenceRefs.length === 0) {
    throw new CounterfactualReviewError(
      "MISSING_EVIDENCE",
      `${scenarioId}:${dimensionRef} modelled values require model/source evidence`
    );
  }
  if (
    (value.truthState === "KNOWN" || value.truthState === "INFERRED") &&
    evidenceRefs.length === 0
  ) {
    throw new CounterfactualReviewError(
      "MISSING_EVIDENCE",
      `${scenarioId}:${dimensionRef} ${value.truthState} values require evidence`
    );
  }

  let comparisonEligible = true;
  let verificationRequired = false;
  let blockerReason: string | null = null;

  if (value.truthState === "CONFLICTED") {
    comparisonEligible = false;
    verificationRequired = true;
    blockerReason = "CONFLICTED_EVIDENCE";
  } else if (
    value.truthState === "UNKNOWN" ||
    value.truthState === "STALE" ||
    value.truthState === "PARTIAL"
  ) {
    comparisonEligible = false;
    verificationRequired = true;
    blockerReason = `${value.truthState}_EVIDENCE`;
  } else if (value.basis === "ASSUMPTION") {
    verificationRequired = true;
  }

  return {
    dimensionRef,
    label,
    kind: value.kind,
    material: value.material === true,
    basis: value.basis,
    truthState: value.truthState,
    range,
    qualitativeValue,
    window,
    evidenceRefs,
    comparisonEligible,
    verificationRequired,
    blockerReason
  };
}

function normalizeAssumptions(
  values: readonly CounterfactualAssumptionInputV1[],
  scenarioId: string
): CounterfactualAssumptionInputV1[] {
  const seen = new Set<string>();
  return bounded(values, "scenario.assumptions", MAX_ASSUMPTIONS)
    .map((item) => {
      const normalized = {
        assumptionId: required(item.assumptionId, "assumption.assumptionId", 256),
        statement: required(item.statement, "assumption.statement"),
        material: item.material === true,
        evidenceRefs: refs(item.evidenceRefs, "assumption.evidenceRefs")
      };
      if (seen.has(normalized.assumptionId)) {
        throw new CounterfactualReviewError(
          "DUPLICATE_ASSUMPTION",
          `${scenarioId} has duplicate assumption ${normalized.assumptionId}`
        );
      }
      seen.add(normalized.assumptionId);
      return normalized;
    })
    .sort((a, b) => a.assumptionId.localeCompare(b.assumptionId));
}

function normalizeResources(
  values: readonly CounterfactualResourceDemandInputV1[],
  scenarioId: string
): CounterfactualResourceDemandInputV1[] {
  const seen = new Set<string>();
  return bounded(values, "scenario.resourceDemands", MAX_RESOURCES)
    .map((item) => {
      const resourceRef = required(item.resourceRef, "resource.resourceRef", 256);
      if (seen.has(resourceRef)) {
        throw new CounterfactualReviewError(
          "DUPLICATE_RESOURCE",
          `${scenarioId} has duplicate resource ${resourceRef}`
        );
      }
      seen.add(resourceRef);
      const evidenceRefs = refs(item.evidenceRefs, "resource.evidenceRefs");
      if (item.amount != null && !Number.isFinite(item.amount)) {
        throw new CounterfactualReviewError(
          "INVALID_RESOURCE_AMOUNT",
          `${scenarioId}:${resourceRef} amount must be finite`
        );
      }
      if (
        item.amount != null &&
        (item.truthState === "KNOWN" || item.truthState === "INFERRED") &&
        evidenceRefs.length === 0
      ) {
        throw new CounterfactualReviewError(
          "MISSING_EVIDENCE",
          `${scenarioId}:${resourceRef} supported resource amounts require evidence`
        );
      }
      if (
        item.amount != null &&
        (item.truthState === "UNKNOWN" || item.truthState === "CONFLICTED")
      ) {
        throw new CounterfactualReviewError(
          "UNSUPPORTED_RESOURCE_AMOUNT",
          `${scenarioId}:${resourceRef} cannot carry an amount while truth is ${item.truthState}`
        );
      }
      return {
        resourceRef,
        label: required(item.label, "resource.label", 256),
        amount: item.amount,
        unit: required(item.unit, "resource.unit", 64),
        truthState: item.truthState,
        evidenceRefs
      };
    })
    .sort((a, b) => a.resourceRef.localeCompare(b.resourceRef));
}

function normalizeScenario(value: CounterfactualScenarioInputV1): CounterfactualScenarioViewV1 {
  const scenarioId = required(value.scenarioId, "scenario.scenarioId", 256);
  const dimensionsSeen = new Set<string>();
  const dimensions = bounded(value.dimensions, "scenario.dimensions", MAX_DIMENSIONS)
    .map((dimension) => normalizeDimension(dimension, scenarioId))
    .map((dimension) => {
      if (dimensionsSeen.has(dimension.dimensionRef)) {
        throw new CounterfactualReviewError(
          "DUPLICATE_DIMENSION",
          `${scenarioId} has duplicate dimension ${dimension.dimensionRef}`
        );
      }
      dimensionsSeen.add(dimension.dimensionRef);
      return dimension;
    })
    .sort((a, b) => a.dimensionRef.localeCompare(b.dimensionRef));

  const assumptions = normalizeAssumptions(value.assumptions, scenarioId);
  const resourceDemands = normalizeResources(value.resourceDemands, scenarioId);
  const verificationReasons = new Set<string>();
  const blockerReasons = new Set<string>();

  for (const dimension of dimensions) {
    if (!dimension.material) continue;
    if (dimension.truthState === "CONFLICTED") {
      blockerReasons.add(`${dimension.dimensionRef}:CONFLICTED_EVIDENCE`);
    } else if (dimension.verificationRequired) {
      verificationReasons.add(
        `${dimension.dimensionRef}:${dimension.blockerReason ?? "ASSUMPTION_REQUIRES_VERIFICATION"}`
      );
    }
  }

  for (const assumption of assumptions) {
    if (assumption.material && assumption.evidenceRefs.length === 0) {
      verificationReasons.add(`${assumption.assumptionId}:UNSUPPORTED_MATERIAL_ASSUMPTION`);
    }
  }

  for (const resource of resourceDemands) {
    if (resource.truthState === "CONFLICTED") {
      blockerReasons.add(`${resource.resourceRef}:CONFLICTED_RESOURCE_DEMAND`);
    } else if (
      resource.truthState === "UNKNOWN" ||
      resource.truthState === "STALE" ||
      resource.truthState === "PARTIAL"
    ) {
      verificationReasons.add(`${resource.resourceRef}:${resource.truthState}_RESOURCE_DEMAND`);
    }
  }

  if (value.approvalClass === "UNKNOWN") {
    verificationReasons.add("APPROVAL_CLASS_UNKNOWN");
  }
  if (value.reversibility === "UNKNOWN") {
    verificationReasons.add("REVERSIBILITY_UNKNOWN");
  }

  const disposition: CounterfactualScenarioDispositionV1 =
    blockerReasons.size > 0
      ? "BLOCKED"
      : verificationReasons.size > 0
        ? "VERIFY_REQUIRED"
        : "COMPARABLE";

  return {
    scenarioId,
    scenarioClass: value.scenarioClass,
    label: required(value.label, "scenario.label", 256),
    dimensions,
    assumptions,
    resourceDemands,
    reversibility: value.reversibility,
    approvalClass: value.approvalClass,
    safeNextStep: required(value.safeNextStep, "scenario.safeNextStep"),
    disposition,
    verificationReasons: [...verificationReasons].sort(),
    blockerReasons: [...blockerReasons].sort()
  };
}

function sameWindow(
  left: CounterfactualWindowV1 | null,
  right: CounterfactualWindowV1 | null
): boolean {
  if (left == null || right == null) return left === right;
  return left.start === right.start && left.end === right.end;
}

function buildComparisons(
  scenarios: readonly CounterfactualScenarioViewV1[]
): {
  comparisons: CounterfactualDimensionComparisonV1[];
  missingComparisonDimensions: string[];
  verificationReasons: string[];
} {
  const dimensionRefs = new Set<string>();
  for (const scenario of scenarios) {
    for (const dimension of scenario.dimensions) {
      if (dimension.material) dimensionRefs.add(dimension.dimensionRef);
    }
  }

  const comparisons: CounterfactualDimensionComparisonV1[] = [];
  const missingComparisonDimensions: string[] = [];
  const verificationReasons: string[] = [];

  for (const dimensionRef of [...dimensionRefs].sort()) {
    const members = scenarios
      .map((scenario) => ({
        scenario,
        dimension: scenario.dimensions.find((item) => item.dimensionRef === dimensionRef) ?? null
      }))
      .filter(
        (entry): entry is {
          scenario: CounterfactualScenarioViewV1;
          dimension: CounterfactualDimensionViewV1;
        } => entry.dimension != null && entry.dimension.material
      );

    if (members.length !== scenarios.length) {
      missingComparisonDimensions.push(dimensionRef);
      verificationReasons.push(`${dimensionRef}:MISSING_FROM_ONE_OR_MORE_SCENARIOS`);
      continue;
    }

    if (members.some((entry) => !entry.dimension.comparisonEligible)) {
      missingComparisonDimensions.push(dimensionRef);
      verificationReasons.push(`${dimensionRef}:NON_DECISION_GRADE_EVIDENCE`);
      continue;
    }

    const [first, ...rest] = members;
    const incompatible = rest.some((entry) => {
      const bothRanges = first.dimension.range != null && entry.dimension.range != null;
      const bothQualitative =
        first.dimension.qualitativeValue != null && entry.dimension.qualitativeValue != null;
      if (!bothRanges && !bothQualitative) return true;
      if (entry.dimension.kind !== first.dimension.kind) return true;
      if (!sameWindow(entry.dimension.window, first.dimension.window)) return true;
      if (
        bothRanges &&
        entry.dimension.range?.unit !== first.dimension.range?.unit
      ) {
        return true;
      }
      return false;
    });

    if (incompatible) {
      missingComparisonDimensions.push(dimensionRef);
      verificationReasons.push(`${dimensionRef}:INCOMPATIBLE_UNIT_OR_WINDOW`);
      continue;
    }

    const conditional = members.some(
      (entry) => entry.dimension.basis !== "OBSERVED"
    );

    comparisons.push({
      dimensionRef,
      label: first.dimension.label,
      kind: first.dimension.kind,
      window: first.dimension.window,
      members: members.map(({ scenario, dimension }) => ({
        scenarioId: scenario.scenarioId,
        basis: dimension.basis,
        truthState: dimension.truthState,
        range: dimension.range,
        qualitativeValue: dimension.qualitativeValue,
        evidenceRefs: dimension.evidenceRefs
      })),
      comparisonClass: conditional
        ? "CONDITIONAL_ON_ASSUMPTIONS"
        : "DIRECT_EVIDENCE",
      winnerSelected: false,
      causalClaimMade: false,
      monetaryValueSynthesized: false
    });
  }

  return {
    comparisons,
    missingComparisonDimensions: [...new Set(missingComparisonDimensions)].sort(),
    verificationReasons: [...new Set(verificationReasons)].sort()
  };
}

export function buildCounterfactualReviewV1(
  input: CounterfactualReviewInputV1
): CounterfactualReviewV1 {
  const decisionId = required(input.decisionId, "decisionId", 256);
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const rawScenarios = bounded(input.scenarios, "scenarios", MAX_SCENARIOS);
  if (rawScenarios.length < 2) {
    throw new CounterfactualReviewError(
      "INSUFFICIENT_SCENARIOS",
      "counterfactual review requires at least two scenarios"
    );
  }

  const scenarioIds = new Set<string>();
  const scenarioClasses = new Set<CounterfactualScenarioClassV1>();
  const scenarios = rawScenarios
    .map(normalizeScenario)
    .map((scenario) => {
      if (scenarioIds.has(scenario.scenarioId)) {
        throw new CounterfactualReviewError(
          "DUPLICATE_SCENARIO",
          `duplicate scenario ${scenario.scenarioId}`
        );
      }
      scenarioIds.add(scenario.scenarioId);
      scenarioClasses.add(scenario.scenarioClass);
      return scenario;
    })
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));

  const reviewVerificationReasons = new Set<string>();
  const reviewBlockerReasons = new Set<string>();

  for (const scenario of scenarios) {
    for (const reason of scenario.verificationReasons) {
      reviewVerificationReasons.add(`${scenario.scenarioId}:${reason}`);
    }
    for (const reason of scenario.blockerReasons) {
      reviewBlockerReasons.add(`${scenario.scenarioId}:${reason}`);
    }
  }

  if (!scenarioClasses.has("DO_NOT")) {
    reviewVerificationReasons.add("DO_NOT_COUNTERFACTUAL_MISSING");
  }

  const comparisonBuild = buildComparisons(scenarios);
  for (const reason of comparisonBuild.verificationReasons) {
    reviewVerificationReasons.add(reason);
  }

  const materialDimensionCount = new Set(
    scenarios.flatMap((scenario) =>
      scenario.dimensions.filter((item) => item.material).map((item) => item.dimensionRef)
    )
  ).size;

  if (materialDimensionCount === 0) {
    reviewBlockerReasons.add("NO_MATERIAL_DIMENSIONS");
  } else if (comparisonBuild.comparisons.length === 0) {
    reviewBlockerReasons.add("NO_COMPARABLE_MATERIAL_DIMENSIONS");
  }

  const blockerReasons = [...reviewBlockerReasons].sort();
  const verificationReasons = [...reviewVerificationReasons].sort();
  const status: CounterfactualReviewStatusV1 =
    blockerReasons.length > 0
      ? "BLOCKED"
      : verificationReasons.length > 0
        ? "VERIFY_REQUIRED"
        : "COMPARISON_READY";

  const reviewId = `counterfactual-review-${stableId({
    decisionId,
    evaluatedAt,
    scenarios
  })}`;

  return freeze({
    contractVersion: "CounterfactualReviewV1",
    policyVersion: COUNTERFACTUAL_REVIEW_POLICY_VERSION_V1,
    reviewId,
    decisionId,
    evaluatedAt,
    status,
    scenarios,
    comparisons: comparisonBuild.comparisons,
    verificationReasons,
    blockerReasons,
    missingComparisonDimensions: comparisonBuild.missingComparisonDimensions,
    actionAuthority: {
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
    }
  });
}

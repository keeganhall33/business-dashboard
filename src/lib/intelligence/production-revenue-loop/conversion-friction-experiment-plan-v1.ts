import type { ConversionFrictionReadinessV1 } from "./conversion-friction-readiness-v1";
import type {
  RevenueOutcomeConfounderV1,
  RevenueOutcomeEvaluationInputV1,
  RevenueOutcomeObservationV1,
  RevenueOutcomeSourceV1,
  RevenueOutcomeSuccessRuleV1,
} from "./revenue-outcome-evaluation-v1";

export const CONVERSION_FRICTION_EXPERIMENT_PLAN_VERSION =
  "CONVERSION_FRICTION_EXPERIMENT_PLAN_V1" as const;

export type ConversionFrictionExperimentPlanReasonV1 =
  | "PREDECLARED_PLAN_READY_FOR_APPROVAL"
  | "PRETEST_READINESS_NOT_ESTABLISHED"
  | "HYPOTHESIS_EVIDENCE_INTEGRITY_FAILURE"
  | "INVALID_DECLARATION_TIME"
  | "INVALID_SUCCESS_RULE"
  | "META_SUCCESS_RULE_FORBIDDEN"
  | "SUCCESS_RULE_EVIDENCE_NOT_PREDECLARED";

export type ConversionFrictionExperimentPlanV1 = Readonly<{
  version: typeof CONVERSION_FRICTION_EXPERIMENT_PLAN_VERSION;
  status: "READY_FOR_APPROVAL" | "BLOCKED";
  reasonCode: ConversionFrictionExperimentPlanReasonV1;
  planId: string | null;
  recommendationId: string;
  declaredAt: string;
  successRule: Readonly<RevenueOutcomeSuccessRuleV1> | null;
  requiredOutcomeSources: readonly RevenueOutcomeSourceV1[];
  hypothesisEvidence: {
    clarityRequired: boolean;
    checkoutRequired: boolean;
    supportingFacts: readonly string[];
    planEvidenceRefs: readonly string[];
  };
  approval: {
    required: true;
    approvalClass: "KEEGAN_APPROVAL_REQUIRED";
    grantedByThisPlan: false;
  };
  metaPolicy: {
    role: "CONTEXT_GUARDRAIL_ONLY";
    outcomeObservationRequired: true;
    spendChangeAllowedByThisPlan: false;
    writeAllowed: false;
    attributionAllowed: false;
  };
  expectedLift: null;
  monetaryValue: null;
  causalClaim: false;
  limitations: readonly string[];
}>;

export type ConversionFrictionExperimentPlanInputV1 = Readonly<{
  readiness: ConversionFrictionReadinessV1;
  declaredAt: string;
  successRule: RevenueOutcomeSuccessRuleV1;
  planEvidenceRefs: readonly string[];
}>;

export type ConversionFrictionApprovalEvidenceV1 = Readonly<{
  state: "KEEGAN_APPROVED" | "NOT_APPROVED";
  approvedAt: string | null;
  evidenceRef: string | null;
}>;

export type ConversionFrictionOutcomeBindingInputV1 = Readonly<{
  plan: ConversionFrictionExperimentPlanV1;
  approval: ConversionFrictionApprovalEvidenceV1;
  implementationRef: string;
  implementedAt: string;
  evaluatedAt: string;
  implementationEvidenceRefs: readonly string[];
  baseline: readonly RevenueOutcomeObservationV1[];
  outcome: readonly RevenueOutcomeObservationV1[];
  confounders?: readonly RevenueOutcomeConfounderV1[];
}>;

export type ConversionFrictionOutcomeBindingReasonV1 =
  | "PREDECLARED_PLAN_BOUND_TO_OUTCOME"
  | "PLAN_NOT_READY"
  | "APPROVAL_NOT_EVIDENCED"
  | "INVALID_TIMELINE"
  | "POST_HOC_CRITERION_BLOCKED"
  | "IMPLEMENTATION_EVIDENCE_MISSING"
  | "REQUIRED_OUTCOME_SOURCE_MISSING";

export type ConversionFrictionOutcomeBindingV1 = Readonly<{
  status: "READY_FOR_CANONICAL_EVALUATION" | "BLOCKED";
  reasonCode: ConversionFrictionOutcomeBindingReasonV1;
  input: RevenueOutcomeEvaluationInputV1 | null;
  missingSources: readonly RevenueOutcomeSourceV1[];
  limitations: readonly string[];
  authority: {
    externalMutationAllowed: false;
    metaWriteAllowed: false;
    actionExecutionAllowed: false;
    approvalBypassAllowed: false;
  };
}>;

const MAX_EVIDENCE_REFS = 20;
const ALLOWED_RULE_SOURCES = new Set<RevenueOutcomeSourceV1>([
  "WOO",
  "GA4",
  "CLARITY",
  "FUNNELKIT",
]);
const ALLOWED_COMPARATORS = new Set<RevenueOutcomeSuccessRuleV1["comparator"]>([
  "AT_LEAST_ABSOLUTE_CHANGE",
  "AT_MOST_ABSOLUTE_CHANGE",
  "AT_LEAST_RELATIVE_CHANGE",
  "AT_MOST_RELATIVE_CHANGE",
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function validText(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function instant(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validEvidenceRefs(value: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_EVIDENCE_REFS
    && value.every((ref) => validText(ref));
}

function validSuccessRule(rule: RevenueOutcomeSuccessRuleV1): boolean {
  return Boolean(
    rule
    && ALLOWED_RULE_SOURCES.has(rule.source)
    && validText(rule.metric, 120)
    && validText(rule.unit, 80)
    && ALLOWED_COMPARATORS.has(rule.comparator)
    && typeof rule.threshold === "number"
    && Number.isFinite(rule.threshold)
    && validText(rule.evidenceRef),
  );
}

function requiredSources(readiness: ConversionFrictionReadinessV1): RevenueOutcomeSourceV1[] {
  const sources: RevenueOutcomeSourceV1[] = ["WOO", "GA4", "META"];
  if (readiness.evidenceBasis.clarityUsed) sources.push("CLARITY");
  if (readiness.evidenceBasis.checkoutUsed) sources.push("FUNNELKIT");
  return sources;
}

function stablePlanId(input: ConversionFrictionExperimentPlanInputV1): string {
  const rule = input.successRule;
  const raw = [
    input.readiness.recommendationId,
    input.declaredAt,
    rule.source,
    rule.metric,
    rule.unit,
    rule.comparator,
    String(rule.threshold),
    rule.evidenceRef,
  ].join(":");
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `conversion-plan:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function planResult(
  input: ConversionFrictionExperimentPlanInputV1,
  status: ConversionFrictionExperimentPlanV1["status"],
  reasonCode: ConversionFrictionExperimentPlanReasonV1,
  limitations: readonly string[],
): ConversionFrictionExperimentPlanV1 {
  const ready = status === "READY_FOR_APPROVAL";
  const evidenceRefs = validEvidenceRefs(input.planEvidenceRefs)
    ? [...new Set(input.planEvidenceRefs)].sort()
    : [];
  const sources = ready ? requiredSources(input.readiness) : [];
  return deepFreeze({
    version: CONVERSION_FRICTION_EXPERIMENT_PLAN_VERSION,
    status,
    reasonCode,
    planId: ready ? stablePlanId(input) : null,
    recommendationId: input.readiness.recommendationId,
    declaredAt: input.declaredAt,
    successRule: ready ? { ...input.successRule } : null,
    requiredOutcomeSources: sources,
    hypothesisEvidence: {
      clarityRequired: input.readiness.evidenceBasis.clarityUsed,
      checkoutRequired: input.readiness.evidenceBasis.checkoutUsed,
      supportingFacts: [...input.readiness.evidenceBasis.supportingFacts],
      planEvidenceRefs: evidenceRefs,
    },
    approval: {
      required: true,
      approvalClass: "KEEGAN_APPROVAL_REQUIRED",
      grantedByThisPlan: false,
    },
    metaPolicy: {
      role: "CONTEXT_GUARDRAIL_ONLY",
      outcomeObservationRequired: true,
      spendChangeAllowedByThisPlan: false,
      writeAllowed: false,
      attributionAllowed: false,
    },
    expectedLift: null,
    monetaryValue: null,
    causalClaim: false,
    limitations: [...new Set(limitations)],
  });
}

/**
 * Locks a conversion-test success rule before execution. A READY result is a
 * proposal for Keegan approval, never approval or execution authority. Woo,
 * GA4, and Meta are all required in the later outcome window; behavioral
 * sources used to justify the hypothesis are required as well. Meta remains
 * contextual only and cannot be the success criterion or receive write
 * authority from this plan.
 */
export function prepareConversionFrictionExperimentPlanV1(
  input: ConversionFrictionExperimentPlanInputV1,
): ConversionFrictionExperimentPlanV1 {
  const readiness = input.readiness;
  if (
    readiness.status !== "READY_TO_PREPARE_TEST"
    || readiness.nextStep.kind !== "PREPARE_BOUNDED_CONVERSION_TEST"
    || readiness.nextStep.approvalClass !== "KEEGAN_APPROVAL_REQUIRED"
    || readiness.nextStep.externalMutationAllowed !== false
    || readiness.nextStep.metaWriteAllowed !== false
  ) {
    return planResult(input, "BLOCKED", "PRETEST_READINESS_NOT_ESTABLISHED", [
      "Only the canonical READY_TO_PREPARE_TEST state may enter conversion-test preregistration.",
    ]);
  }

  if (
    (!readiness.evidenceBasis.clarityUsed && !readiness.evidenceBasis.checkoutUsed)
    || readiness.evidenceBasis.supportingFacts.length === 0
  ) {
    return planResult(input, "BLOCKED", "HYPOTHESIS_EVIDENCE_INTEGRITY_FAILURE", [
      "A conversion experiment requires an evidence-backed Clarity or checkout friction hypothesis.",
    ]);
  }

  if (instant(input.declaredAt) === null) {
    return planResult(input, "BLOCKED", "INVALID_DECLARATION_TIME", [
      "The measurement rule must have a valid preregistration timestamp.",
    ]);
  }

  if (input.successRule?.source === "META") {
    return planResult(input, "BLOCKED", "META_SUCCESS_RULE_FORBIDDEN", [
      "Meta may be observed as a spend/context guardrail, but Meta-attributed outcomes cannot define success for this conversion experiment.",
    ]);
  }

  if (!validSuccessRule(input.successRule)) {
    return planResult(input, "BLOCKED", "INVALID_SUCCESS_RULE", [
      "The success criterion must be a bounded structured rule over Woo, GA4, Clarity, or FunnelKit evidence.",
    ]);
  }

  if (
    !validEvidenceRefs(input.planEvidenceRefs)
    || !input.planEvidenceRefs.includes(input.successRule.evidenceRef)
  ) {
    return planResult(input, "BLOCKED", "SUCCESS_RULE_EVIDENCE_NOT_PREDECLARED", [
      "The success-rule evidence reference must be present in the preregistered plan evidence set.",
    ]);
  }

  return planResult(input, "READY_FOR_APPROVAL", "PREDECLARED_PLAN_READY_FOR_APPROVAL", [
    "This plan locks the measurement rule and required evidence sources before implementation; it does not authorize implementation.",
    "Observed outcome movement remains non-causal even when the preregistered criterion is met.",
  ]);
}

function bindingAuthority(): ConversionFrictionOutcomeBindingV1["authority"] {
  return {
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    actionExecutionAllowed: false,
    approvalBypassAllowed: false,
  };
}

function blockedBinding(
  reasonCode: Exclude<ConversionFrictionOutcomeBindingReasonV1, "PREDECLARED_PLAN_BOUND_TO_OUTCOME">,
  limitation: string,
  missingSources: readonly RevenueOutcomeSourceV1[] = [],
): ConversionFrictionOutcomeBindingV1 {
  return deepFreeze({
    status: "BLOCKED",
    reasonCode,
    input: null,
    missingSources: [...missingSources],
    limitations: [limitation],
    authority: bindingAuthority(),
  });
}

function missingRequiredSources(
  required: readonly RevenueOutcomeSourceV1[],
  observations: readonly RevenueOutcomeObservationV1[],
): RevenueOutcomeSourceV1[] {
  const present = new Set(observations.map((item) => item.source));
  return required.filter((source) => !present.has(source));
}

/**
 * Binds an approved implementation to the exact preregistered rule and source
 * set. The returned canonical evaluation input cannot substitute a post-hoc
 * success rule. Downstream freshness, completeness, date-range, confounder,
 * and comparison checks remain the responsibility of the canonical revenue
 * outcome evaluator.
 */
export function bindConversionFrictionOutcomeInputV1(
  value: ConversionFrictionOutcomeBindingInputV1,
): ConversionFrictionOutcomeBindingV1 {
  if (
    value.plan.status !== "READY_FOR_APPROVAL"
    || !value.plan.planId
    || !value.plan.successRule
  ) {
    return blockedBinding(
      "PLAN_NOT_READY",
      "A blocked or incomplete preregistration cannot be bound to an outcome evaluation.",
    );
  }

  const declaredAt = instant(value.plan.declaredAt);
  const approvedAt = instant(value.approval.approvedAt);
  const implementedAt = instant(value.implementedAt);
  const evaluatedAt = instant(value.evaluatedAt);

  if (
    value.approval.state !== "KEEGAN_APPROVED"
    || approvedAt === null
    || !validText(value.approval.evidenceRef)
  ) {
    return blockedBinding(
      "APPROVAL_NOT_EVIDENCED",
      "Keegan approval must be explicitly evidenced before an implementation can enter outcome measurement.",
    );
  }

  if (
    declaredAt === null
    || implementedAt === null
    || evaluatedAt === null
    || declaredAt > approvedAt
    || approvedAt > implementedAt
    || implementedAt > evaluatedAt
  ) {
    return blockedBinding(
      declaredAt !== null && implementedAt !== null && declaredAt > implementedAt
        ? "POST_HOC_CRITERION_BLOCKED"
        : "INVALID_TIMELINE",
      "The criterion must be preregistered before approval and implementation, and evaluation must occur after implementation.",
    );
  }

  if (!validText(value.implementationRef) || !validEvidenceRefs(value.implementationEvidenceRefs)) {
    return blockedBinding(
      "IMPLEMENTATION_EVIDENCE_MISSING",
      "Outcome evaluation requires an explicit implementation reference and evidence lineage.",
    );
  }

  const baselineMissing = missingRequiredSources(value.plan.requiredOutcomeSources, value.baseline);
  const outcomeMissing = missingRequiredSources(value.plan.requiredOutcomeSources, value.outcome);
  const missingSources = [...new Set([...baselineMissing, ...outcomeMissing])].sort() as RevenueOutcomeSourceV1[];
  if (missingSources.length > 0) {
    return blockedBinding(
      "REQUIRED_OUTCOME_SOURCE_MISSING",
      "Woo, GA4, Meta, and every behavioral source used by the friction hypothesis must be present in both baseline and outcome evidence.",
      missingSources,
    );
  }

  const canonicalInput: RevenueOutcomeEvaluationInputV1 = {
    decisionRef: value.plan.recommendationId,
    implementationRef: value.implementationRef,
    implementedAt: value.implementedAt,
    evaluatedAt: value.evaluatedAt,
    implementationEvidenceRefs: [
      ...new Set([
        ...value.implementationEvidenceRefs,
        value.approval.evidenceRef,
      ]),
    ].sort(),
    baseline: value.baseline.map((item) => ({
      ...item,
      range: { ...item.range },
      evidenceRefs: [...item.evidenceRefs],
    })),
    outcome: value.outcome.map((item) => ({
      ...item,
      range: { ...item.range },
      evidenceRefs: [...item.evidenceRefs],
    })),
    successRule: { ...value.plan.successRule },
    confounders: value.confounders?.map((item) => ({
      ...item,
      evidenceRefs: [...item.evidenceRefs],
    })),
  };

  return deepFreeze({
    status: "READY_FOR_CANONICAL_EVALUATION",
    reasonCode: "PREDECLARED_PLAN_BOUND_TO_OUTCOME",
    input: canonicalInput,
    missingSources: [],
    limitations: [
      "The success rule is copied from preregistration and cannot be selected after observing the outcome.",
      "Required Meta evidence is spend/context guardrail evidence only; it does not establish channel attribution or authorize a Meta write.",
      "Canonical outcome evaluation must still fail closed on stale, partial, conflicted, incomplete, or date-mismatched observations.",
    ],
    authority: bindingAuthority(),
  });
}

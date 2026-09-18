import { createHash } from "node:crypto";

import {
  buildDecisionPortfolioV1,
  type DecisionCandidateV1,
  type DecisionEvidenceStateV1,
  type DecisionPortfolioCapacityV1,
  type DecisionPortfolioV1
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1 = "experiment_portfolio_policy_v1.0.0" as const;

export type ExperimentDomainV1 =
  | "WEBSITE"
  | "EMAIL"
  | "PAID_MEDIA"
  | "OFFER"
  | "PRICING_PRESENTATION"
  | "LAUNCH"
  | "RELATIONSHIP"
  | "CONTENT"
  | "WORKFLOW";

export type ExperimentComparisonDesignV1 =
  | "RANDOMIZED_HOLDOUT"
  | "MATCHED_COMPARISON"
  | "PRE_POST"
  | "NONE";

export type ExperimentAttributionClassV1 =
  | "NOT_ESTABLISHED"
  | "CORRELATIONAL"
  | "CAUSAL_SUPPORTED";

export type ExperimentRuleKindV1 = "SUCCESS" | "STOP" | "SCALE";
export type ExperimentComparatorV1 = "GTE" | "LTE";

export type ExperimentDecisionRuleV1 = {
  id: string;
  kind: ExperimentRuleKindV1;
  metric: string;
  unit: string;
  comparator: ExperimentComparatorV1;
  threshold: number;
  notBeforeAt: string;
  minimumSampleSize: number;
  evidenceRefs: readonly string[];
};

export type ExperimentPredictionV1 = {
  metric: string;
  unit: string;
  low: number;
  expected: number;
  high: number;
  evidenceRefs: readonly string[];
};

export type ExperimentObservationV1 = {
  metric: string;
  unit: string;
  value: number;
  sampleSize: number;
  observedAt: string;
  truthState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
  attributionClass: ExperimentAttributionClassV1;
  attributionEvidenceRefs: readonly string[];
  confounders: readonly string[];
};

export type ExperimentPolicyCandidateV1 = {
  statement: string;
  rollbackPlan: string;
  minimumIndependentReplications: number;
  independentReplicationEvidenceRefs: readonly string[];
};

export type ExperimentCandidateV1 = {
  id: string;
  title: string;
  domain: ExperimentDomainV1;
  decisionCandidate: DecisionCandidateV1;
  registeredAt: string;
  causalHypothesis: string;
  comparisonDesign: {
    kind: ExperimentComparisonDesignV1;
    assignmentUnit: string | null;
    description: string;
    evidenceRefs: readonly string[];
  };
  successRule: ExperimentDecisionRuleV1;
  stopRule: ExperimentDecisionRuleV1;
  scaleRule: ExperimentDecisionRuleV1;
  prediction: ExperimentPredictionV1 | null;
  knownConfounders: readonly string[];
  observation: ExperimentObservationV1 | null;
  policyUpdateCandidate: ExperimentPolicyCandidateV1 | null;
};

export type ExperimentReviewStateV1 =
  | "NOT_EVALUATED"
  | "WAITING_FOR_WINDOW"
  | "SUCCESS_REVIEW"
  | "STOP_REVIEW"
  | "SCALE_REVIEW"
  | "INCONCLUSIVE"
  | "VERIFY_REQUIRED";

export type ExperimentCalibrationV1 =
  | "WITHIN_PREDICTED_RANGE"
  | "ABOVE_PREDICTED_RANGE"
  | "BELOW_PREDICTED_RANGE"
  | "UNKNOWN";

export type ExperimentPortfolioItemV1 = {
  experimentId: string;
  decisionCandidateId: string;
  portfolioDisposition: DecisionPortfolioV1["items"][number]["disposition"];
  preRegistrationState: "VALID" | "VERIFY_REQUIRED";
  verificationReasons: readonly string[];
  reviewState: ExperimentReviewStateV1;
  attributionClass: ExperimentAttributionClassV1;
  causalClaimAllowed: boolean;
  calibration: ExperimentCalibrationV1;
  confounders: readonly string[];
  policyUpdate: {
    mode: "NONE" | "SHADOW_ONLY";
    statement: string | null;
    rollbackPlan: string | null;
    minimumIndependentReplications: number | null;
    evidencedIndependentReplications: number;
    eligibleForIndependentReview: boolean;
    canPromoteAutomatically: false;
  };
};

export type ExperimentPortfolioV1 = {
  contractVersion: "ExperimentPortfolioV1";
  policyVersion: typeof EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1;
  generatedAt: string;
  portfolioId: string;
  decisionPortfolio: DecisionPortfolioV1;
  items: readonly ExperimentPortfolioItemV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  audit: {
    experimentsConsidered: number;
    preRegisteredValid: number;
    verificationRequired: number;
    observationsEvaluated: number;
  };
  authority: {
    launchExperiment: false;
    changeSpend: false;
    changePrice: false;
    publish: false;
    sendOutreach: false;
    promotePolicy: false;
  };
};

export class ExperimentPortfolioError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExperimentPortfolioError";
  }
}

const MAX_EXPERIMENTS = 12;
const MAX_REFS = 100;
const DOMAINS = new Set<ExperimentDomainV1>([
  "WEBSITE",
  "EMAIL",
  "PAID_MEDIA",
  "OFFER",
  "PRICING_PRESENTATION",
  "LAUNCH",
  "RELATIONSHIP",
  "CONTENT",
  "WORKFLOW"
]);
const DESIGNS = new Set<ExperimentComparisonDesignV1>([
  "RANDOMIZED_HOLDOUT",
  "MATCHED_COMPARISON",
  "PRE_POST",
  "NONE"
]);
const ATTRIBUTION = new Set<ExperimentAttributionClassV1>([
  "NOT_ESTABLISHED",
  "CORRELATIONAL",
  "CAUSAL_SUPPORTED"
]);

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentPortfolioError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function canonicalTimestamp(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new ExperimentPortfolioError("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return normalized;
}

function finite(value: unknown, label: string, minimum = -Number.MAX_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ExperimentPortfolioError("INVALID_NUMBER", `${label} must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = finite(value, label, minimum, maximum);
  if (!Number.isInteger(parsed)) throw new ExperimentPortfolioError("INVALID_NUMBER", `${label} must be an integer`);
  return parsed;
}

function refs(values: readonly string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS || (!allowEmpty && values.length === 0)) {
    throw new ExperimentPortfolioError("INVALID_REFS", `${label} must be ${allowEmpty ? "a bounded" : "a non-empty bounded"} list`);
  }
  const normalized = values.map((value) => requiredText(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new ExperimentPortfolioError("DUPLICATE_REF", `${label} contains duplicate references`);
  }
  return normalized.slice().sort((a, b) => a.localeCompare(b));
}

function strings(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new ExperimentPortfolioError("INVALID_LIST", `${label} must be a bounded list`);
  }
  const normalized = values.map((value) => requiredText(value, label));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
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

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function validateRule(
  rule: ExperimentDecisionRuleV1,
  expectedKind: ExperimentRuleKindV1,
  experimentId: string,
  windowStart: string,
  windowEnd: string
): ExperimentDecisionRuleV1 {
  if (rule.kind !== expectedKind) {
    throw new ExperimentPortfolioError("RULE_KIND_MISMATCH", `${experimentId}.${expectedKind} rule kind is invalid`);
  }
  if (!new Set<ExperimentComparatorV1>(["GTE", "LTE"]).has(rule.comparator)) {
    throw new ExperimentPortfolioError("INVALID_COMPARATOR", `${experimentId}.${expectedKind} comparator is invalid`);
  }
  const notBeforeAt = canonicalTimestamp(rule.notBeforeAt, `${experimentId}.${expectedKind}.notBeforeAt`);
  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = Date.parse(windowEnd);
  const notBeforeMs = Date.parse(notBeforeAt);
  if (notBeforeMs < windowStartMs || notBeforeMs > windowEndMs) {
    throw new ExperimentPortfolioError("RULE_WINDOW_MISMATCH", `${experimentId}.${expectedKind} decision time must be inside the evaluation window`);
  }
  if ((expectedKind === "SUCCESS" || expectedKind === "SCALE") && notBeforeMs < windowEndMs) {
    throw new ExperimentPortfolioError("PEEKING_RISK", `${experimentId}.${expectedKind} cannot be evaluated before the pre-registered evaluation window ends`);
  }
  return {
    id: requiredText(rule.id, `${experimentId}.${expectedKind}.id`),
    kind: rule.kind,
    metric: requiredText(rule.metric, `${experimentId}.${expectedKind}.metric`),
    unit: requiredText(rule.unit, `${experimentId}.${expectedKind}.unit`),
    comparator: rule.comparator,
    threshold: finite(rule.threshold, `${experimentId}.${expectedKind}.threshold`),
    notBeforeAt,
    minimumSampleSize: integer(rule.minimumSampleSize, `${experimentId}.${expectedKind}.minimumSampleSize`, 1, 1_000_000_000),
    evidenceRefs: refs(rule.evidenceRefs, `${experimentId}.${expectedKind}.evidenceRefs`)
  };
}

function breached(rule: ExperimentDecisionRuleV1, observation: ExperimentObservationV1): boolean {
  return rule.comparator === "GTE" ? observation.value >= rule.threshold : observation.value <= rule.threshold;
}

function calibrationFor(prediction: ExperimentPredictionV1 | null, observation: ExperimentObservationV1 | null): ExperimentCalibrationV1 {
  if (!prediction || !observation || prediction.metric !== observation.metric || prediction.unit !== observation.unit) return "UNKNOWN";
  if (observation.value < prediction.low) return "BELOW_PREDICTED_RANGE";
  if (observation.value > prediction.high) return "ABOVE_PREDICTED_RANGE";
  return "WITHIN_PREDICTED_RANGE";
}

function evaluateObservation(
  experiment: ExperimentCandidateV1,
  reasons: string[],
  generatedAt: string
): Pick<ExperimentPortfolioItemV1, "reviewState" | "attributionClass" | "causalClaimAllowed" | "calibration" | "confounders"> {
  const observation = experiment.observation;
  if (!observation) {
    return {
      reviewState: "NOT_EVALUATED",
      attributionClass: "NOT_ESTABLISHED",
      causalClaimAllowed: false,
      calibration: "UNKNOWN",
      confounders: experiment.knownConfounders
    };
  }

  const observedAt = canonicalTimestamp(observation.observedAt, `${experiment.id}.observation.observedAt`);
  const observationMs = Date.parse(observedAt);
  if (observationMs > Date.parse(generatedAt)) reasons.push("OBSERVATION_FROM_FUTURE");
  if (observationMs < Date.parse(experiment.decisionCandidate.evaluationWindow.start)) reasons.push("OBSERVATION_BEFORE_EXPERIMENT_WINDOW");
  if (!ATTRIBUTION.has(observation.attributionClass)) reasons.push("INVALID_ATTRIBUTION_CLASS");
  if (observation.truthState !== "KNOWN") reasons.push(`OBSERVATION_${observation.truthState}`);

  const observationEvidence = refs(observation.evidenceRefs, `${experiment.id}.observation.evidenceRefs`);
  const attributionEvidence = refs(
    observation.attributionEvidenceRefs,
    `${experiment.id}.observation.attributionEvidenceRefs`,
    observation.attributionClass === "NOT_ESTABLISHED"
  );
  if (observation.metric !== experiment.successRule.metric || observation.unit !== experiment.successRule.unit) {
    reasons.push("OBSERVATION_METRIC_MISMATCH");
  }
  const sampleSize = integer(observation.sampleSize, `${experiment.id}.observation.sampleSize`, 1, 1_000_000_000);
  finite(observation.value, `${experiment.id}.observation.value`);
  const confounders = strings(observation.confounders, `${experiment.id}.observation.confounders`);
  if (observation.attributionClass === "CAUSAL_SUPPORTED" && experiment.comparisonDesign.kind !== "RANDOMIZED_HOLDOUT") {
    reasons.push("CAUSAL_CLAIM_WITHOUT_RANDOMIZED_HOLDOUT");
  }
  if (observation.attributionClass === "CAUSAL_SUPPORTED" && attributionEvidence.length === 0) {
    reasons.push("CAUSAL_ATTRIBUTION_MISSING_EVIDENCE");
  }
  if (observationEvidence.length === 0) reasons.push("OBSERVATION_MISSING_EVIDENCE");

  const minimumRequired = Math.max(
    experiment.successRule.minimumSampleSize,
    experiment.stopRule.minimumSampleSize,
    experiment.scaleRule.minimumSampleSize
  );
  if (sampleSize < minimumRequired) reasons.push("MINIMUM_SAMPLE_NOT_REACHED");

  if (reasons.length > 0) {
    return {
      reviewState: "VERIFY_REQUIRED",
      attributionClass: observation.attributionClass,
      causalClaimAllowed: false,
      calibration: calibrationFor(experiment.prediction, observation),
      confounders: [...new Set([...experiment.knownConfounders, ...confounders])].sort((a, b) => a.localeCompare(b))
    };
  }

  const stopEligible = observationMs >= Date.parse(experiment.stopRule.notBeforeAt);
  const successEligible = observationMs >= Date.parse(experiment.successRule.notBeforeAt);
  const scaleEligible = observationMs >= Date.parse(experiment.scaleRule.notBeforeAt);

  let reviewState: ExperimentReviewStateV1 = "INCONCLUSIVE";
  if (stopEligible && breached(experiment.stopRule, observation)) reviewState = "STOP_REVIEW";
  else if (!successEligible) reviewState = "WAITING_FOR_WINDOW";
  else if (scaleEligible && breached(experiment.scaleRule, observation)) reviewState = "SCALE_REVIEW";
  else if (breached(experiment.successRule, observation)) reviewState = "SUCCESS_REVIEW";

  return {
    reviewState,
    attributionClass: observation.attributionClass,
    causalClaimAllowed: observation.attributionClass === "CAUSAL_SUPPORTED" && experiment.comparisonDesign.kind === "RANDOMIZED_HOLDOUT",
    calibration: calibrationFor(experiment.prediction, observation),
    confounders: [...new Set([...experiment.knownConfounders, ...confounders])].sort((a, b) => a.localeCompare(b))
  };
}

function policyProjection(candidate: ExperimentPolicyCandidateV1 | null): ExperimentPortfolioItemV1["policyUpdate"] {
  if (!candidate) {
    return {
      mode: "NONE",
      statement: null,
      rollbackPlan: null,
      minimumIndependentReplications: null,
      evidencedIndependentReplications: 0,
      eligibleForIndependentReview: false,
      canPromoteAutomatically: false
    };
  }
  const minimum = integer(candidate.minimumIndependentReplications, "policy.minimumIndependentReplications", 2, 100);
  const replicationEvidence = refs(candidate.independentReplicationEvidenceRefs, "policy.independentReplicationEvidenceRefs", true);
  return {
    mode: "SHADOW_ONLY",
    statement: requiredText(candidate.statement, "policy.statement"),
    rollbackPlan: requiredText(candidate.rollbackPlan, "policy.rollbackPlan"),
    minimumIndependentReplications: minimum,
    evidencedIndependentReplications: replicationEvidence.length,
    eligibleForIndependentReview: replicationEvidence.length >= minimum,
    canPromoteAutomatically: false
  };
}

export function buildExperimentPortfolioV1(input: {
  experiments: readonly ExperimentCandidateV1[];
  capacity: DecisionPortfolioCapacityV1;
  generatedAt: string;
  satisfiedDependencyIds?: readonly string[];
}): ExperimentPortfolioV1 {
  if (!Array.isArray(input.experiments) || input.experiments.length > MAX_EXPERIMENTS) {
    throw new ExperimentPortfolioError("EXPERIMENT_BOUND", `At most ${MAX_EXPERIMENTS} experiments may be compiled`);
  }
  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const cloned = structuredClone(input.experiments) as ExperimentCandidateV1[];
  const ids = new Set<string>();
  const normalized: Array<{ experiment: ExperimentCandidateV1; reasons: string[]; decisionCandidate: DecisionCandidateV1 }> = [];

  for (const experiment of cloned.sort((a, b) => a.id.localeCompare(b.id))) {
    experiment.id = requiredText(experiment.id, "experiment.id");
    experiment.title = requiredText(experiment.title, `${experiment.id}.title`);
    if (ids.has(experiment.id)) throw new ExperimentPortfolioError("DUPLICATE_EXPERIMENT", `Duplicate experiment id ${experiment.id}`);
    ids.add(experiment.id);
    if (!DOMAINS.has(experiment.domain)) throw new ExperimentPortfolioError("INVALID_DOMAIN", `${experiment.id}.domain is invalid`);
    if (experiment.decisionCandidate.candidateType !== "EXPERIMENT" || experiment.decisionCandidate.id !== experiment.id) {
      throw new ExperimentPortfolioError("DECISION_IDENTITY_MISMATCH", `${experiment.id} must use a matching EXPERIMENT decision candidate`);
    }

    const registeredAt = canonicalTimestamp(experiment.registeredAt, `${experiment.id}.registeredAt`);
    experiment.registeredAt = registeredAt;
    experiment.causalHypothesis = requiredText(experiment.causalHypothesis, `${experiment.id}.causalHypothesis`);
    if (!DESIGNS.has(experiment.comparisonDesign.kind)) {
      throw new ExperimentPortfolioError("INVALID_DESIGN", `${experiment.id}.comparisonDesign.kind is invalid`);
    }
    experiment.comparisonDesign.description = requiredText(experiment.comparisonDesign.description, `${experiment.id}.comparisonDesign.description`);
    experiment.comparisonDesign.assignmentUnit = experiment.comparisonDesign.assignmentUnit == null
      ? null
      : requiredText(experiment.comparisonDesign.assignmentUnit, `${experiment.id}.comparisonDesign.assignmentUnit`);
    experiment.comparisonDesign.evidenceRefs = refs(experiment.comparisonDesign.evidenceRefs, `${experiment.id}.comparisonDesign.evidenceRefs`, experiment.comparisonDesign.kind === "NONE");
    experiment.knownConfounders = strings(experiment.knownConfounders, `${experiment.id}.knownConfounders`);

    const windowStart = canonicalTimestamp(experiment.decisionCandidate.evaluationWindow.start, `${experiment.id}.evaluationWindow.start`);
    const windowEnd = canonicalTimestamp(experiment.decisionCandidate.evaluationWindow.end, `${experiment.id}.evaluationWindow.end`);
    if (Date.parse(windowEnd) < Date.parse(windowStart)) throw new ExperimentPortfolioError("INVALID_WINDOW", `${experiment.id} evaluation window is unordered`);
    const reasons: string[] = [];
    if (Date.parse(registeredAt) > Date.parse(windowStart)) reasons.push("NOT_PRE_REGISTERED_BEFORE_START");
    if (Date.parse(registeredAt) > Date.parse(generatedAt)) reasons.push("REGISTRATION_FROM_FUTURE");
    if (experiment.comparisonDesign.kind === "NONE") reasons.push("NO_COMPARISON_DESIGN");
    if (experiment.comparisonDesign.kind === "RANDOMIZED_HOLDOUT" && !experiment.comparisonDesign.assignmentUnit) reasons.push("MISSING_ASSIGNMENT_UNIT");
    if (experiment.decisionCandidate.evidenceState !== "KNOWN") reasons.push(`DECISION_EVIDENCE_${experiment.decisionCandidate.evidenceState}`);
    if (experiment.decisionCandidate.evidenceRefs.length === 0 || experiment.decisionCandidate.sourceRefs.length === 0) reasons.push("MISSING_DECISION_PROVENANCE");

    experiment.successRule = validateRule(experiment.successRule, "SUCCESS", experiment.id, windowStart, windowEnd);
    experiment.stopRule = validateRule(experiment.stopRule, "STOP", experiment.id, windowStart, windowEnd);
    experiment.scaleRule = validateRule(experiment.scaleRule, "SCALE", experiment.id, windowStart, windowEnd);
    const metricIdentity = `${experiment.successRule.metric}\u0000${experiment.successRule.unit}`;
    if (`${experiment.stopRule.metric}\u0000${experiment.stopRule.unit}` !== metricIdentity || `${experiment.scaleRule.metric}\u0000${experiment.scaleRule.unit}` !== metricIdentity) {
      throw new ExperimentPortfolioError("RULE_METRIC_MISMATCH", `${experiment.id} rules must use one explicit metric definition`);
    }

    if (experiment.prediction) {
      experiment.prediction.metric = requiredText(experiment.prediction.metric, `${experiment.id}.prediction.metric`);
      experiment.prediction.unit = requiredText(experiment.prediction.unit, `${experiment.id}.prediction.unit`);
      experiment.prediction.low = finite(experiment.prediction.low, `${experiment.id}.prediction.low`);
      experiment.prediction.expected = finite(experiment.prediction.expected, `${experiment.id}.prediction.expected`);
      experiment.prediction.high = finite(experiment.prediction.high, `${experiment.id}.prediction.high`);
      experiment.prediction.evidenceRefs = refs(experiment.prediction.evidenceRefs, `${experiment.id}.prediction.evidenceRefs`);
      if (!(experiment.prediction.low <= experiment.prediction.expected && experiment.prediction.expected <= experiment.prediction.high)) {
        throw new ExperimentPortfolioError("INVALID_PREDICTION_RANGE", `${experiment.id} prediction range is unordered`);
      }
      if (`${experiment.prediction.metric}\u0000${experiment.prediction.unit}` !== metricIdentity) reasons.push("PREDICTION_METRIC_MISMATCH");
    }

    const decisionCandidate = structuredClone(experiment.decisionCandidate);
    if (reasons.length > 0) decisionCandidate.blockers = [...new Set([...decisionCandidate.blockers, "experiment_pre_registration_verification_required"])];
    normalized.push({ experiment, reasons, decisionCandidate });
  }

  const decisionPortfolio = buildDecisionPortfolioV1({
    candidates: normalized.map((entry) => entry.decisionCandidate),
    capacity: input.capacity,
    generatedAt,
    satisfiedDependencyIds: input.satisfiedDependencyIds
  });
  const dispositionById = new Map(decisionPortfolio.items.map((item) => [item.candidate.id, item.disposition]));

  const items = normalized.map(({ experiment, reasons }): ExperimentPortfolioItemV1 => {
    const observationProjection = evaluateObservation(experiment, reasons, generatedAt);
    const uniqueReasons = [...new Set(reasons)].sort((a, b) => a.localeCompare(b));
    return {
      experimentId: experiment.id,
      decisionCandidateId: experiment.decisionCandidate.id,
      portfolioDisposition: dispositionById.get(experiment.id)!,
      preRegistrationState: uniqueReasons.length === 0 ? "VALID" : "VERIFY_REQUIRED",
      verificationReasons: uniqueReasons,
      ...observationProjection,
      reviewState: uniqueReasons.length > 0 ? "VERIFY_REQUIRED" : observationProjection.reviewState,
      causalClaimAllowed: uniqueReasons.length > 0 ? false : observationProjection.causalClaimAllowed,
      policyUpdate: policyProjection(experiment.policyUpdateCandidate)
    };
  });

  const evidenceRefs = refs(
    normalized.flatMap(({ experiment }) => [
      ...experiment.decisionCandidate.evidenceRefs,
      ...experiment.comparisonDesign.evidenceRefs,
      ...experiment.successRule.evidenceRefs,
      ...experiment.stopRule.evidenceRefs,
      ...experiment.scaleRule.evidenceRefs,
      ...(experiment.prediction?.evidenceRefs ?? []),
      ...(experiment.observation?.evidenceRefs ?? []),
      ...(experiment.observation?.attributionEvidenceRefs ?? []),
      ...(experiment.policyUpdateCandidate?.independentReplicationEvidenceRefs ?? [])
    ]),
    "portfolio.evidenceRefs",
    true
  );
  const sourceRefs = refs(normalized.flatMap(({ experiment }) => experiment.decisionCandidate.sourceRefs), "portfolio.sourceRefs", true);
  const identity = {
    policyVersion: EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
    generatedAt,
    decisionPortfolioId: decisionPortfolio.portfolioId,
    experiments: items.map((item) => ({ id: item.experimentId, reviewState: item.reviewState, reasons: item.verificationReasons }))
  };

  return freeze({
    contractVersion: "ExperimentPortfolioV1",
    policyVersion: EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
    generatedAt,
    portfolioId: `experiment_portfolio_${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 20)}`,
    decisionPortfolio,
    items,
    evidenceRefs,
    sourceRefs,
    audit: {
      experimentsConsidered: items.length,
      preRegisteredValid: items.filter((item) => item.preRegistrationState === "VALID").length,
      verificationRequired: items.filter((item) => item.preRegistrationState === "VERIFY_REQUIRED").length,
      observationsEvaluated: normalized.filter(({ experiment }) => experiment.observation != null).length
    },
    authority: {
      launchExperiment: false,
      changeSpend: false,
      changePrice: false,
      publish: false,
      sendOutreach: false,
      promotePolicy: false
    }
  });
}

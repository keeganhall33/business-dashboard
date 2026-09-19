import { createHash } from "node:crypto";

import {
  EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
  type ExperimentCandidateV1,
  type ExperimentDecisionRuleV1,
  type ExperimentObservationV1,
  type ExperimentPortfolioV1
} from "./experiment-portfolio-v1";
import {
  EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1,
  type ExperimentReallocationHandoffV1
} from "./experiment-reallocation-handoff-v1";
import { DECISION_PORTFOLIO_POLICY_VERSION_V1 } from "../strategy-engine/decision-portfolio-v1";
import {
  DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1,
  type DecisionSuccessCriterionStateV1
} from "../strategy-engine/decision-portfolio-reallocation-v1";

export const EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_CONTRACT_VERSION_V1 =
  "ExperimentReallocationSuccessIntegrityV1" as const;
export const EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_POLICY_VERSION_V1 =
  "experiment_reallocation_success_integrity_v1.0.0" as const;

const MAX_REFS = 100;

export type ExperimentReallocationSuccessIntegrityStatusV1 =
  | "WAIT"
  | "VERIFY_REQUIRED"
  | "CERTIFIED_FOR_REALLOCATION_REVIEW";

export type ExperimentReallocationSuccessIntegrityV1 = {
  contractVersion: typeof EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_CONTRACT_VERSION_V1;
  policyVersion: typeof EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_POLICY_VERSION_V1;
  certificationId: string;
  generatedAt: string;
  experimentPortfolioId: string;
  decisionPortfolioId: string;
  experimentId: string;
  handoffId: string;
  status: ExperimentReallocationSuccessIntegrityStatusV1;
  reasons: readonly string[];
  successRule: null | {
    ruleId: string;
    metric: string;
    unit: string;
    comparator: ExperimentDecisionRuleV1["comparator"];
    threshold: number;
    minimumSampleSize: number;
    notBeforeAt: string;
  };
  observedSuccessCriterionState: DecisionSuccessCriterionStateV1 | null;
  certifiedReallocationReviewId: string | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  authority: {
    mutateExperiment: false;
    mutatePortfolio: false;
    changeAllocation: false;
    changeSpend: false;
    changePrice: false;
    publish: false;
    sendOutreach: false;
    promotePolicy: false;
    inferCausality: false;
    inferConfidence: false;
    inferMonetaryValue: false;
    externalAction: false;
    approvalBypass: false;
  };
};

export class ExperimentReallocationSuccessIntegrityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExperimentReallocationSuccessIntegrityError";
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentReallocationSuccessIntegrityError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new ExperimentReallocationSuccessIntegrityError(
      "INVALID_TIMESTAMP",
      `${label} must be a canonical ISO timestamp`
    );
  }
  return normalized;
}

function refs(values: readonly string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS || (!allowEmpty && values.length === 0)) {
    throw new ExperimentReallocationSuccessIntegrityError(
      "INVALID_REFS",
      `${label} must be ${allowEmpty ? "a bounded" : "a non-empty bounded"} list`
    );
  }
  const normalized = values.map((value) => text(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new ExperimentReallocationSuccessIntegrityError("DUPLICATE_REF", `${label} contains duplicate refs`);
  }
  return normalized.slice().sort((a, b) => a.localeCompare(b));
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

function breached(rule: ExperimentDecisionRuleV1, observation: ExperimentObservationV1): boolean {
  return rule.comparator === "GTE"
    ? observation.value >= rule.threshold
    : observation.value <= rule.threshold;
}

function mechanicalSuccessState(
  rule: ExperimentDecisionRuleV1,
  observation: ExperimentObservationV1
): DecisionSuccessCriterionStateV1 {
  if (observation.metric !== rule.metric || observation.unit !== rule.unit) return "NOT_EVALUABLE";
  if (observation.sampleSize < rule.minimumSampleSize) return "NOT_EVALUABLE";
  if (Date.parse(observation.observedAt) < Date.parse(rule.notBeforeAt)) return "NOT_EVALUABLE";
  return breached(rule, observation) ? "MET" : "NOT_MET";
}

function authorityIsSafe(handoff: ExperimentReallocationHandoffV1): boolean {
  return Object.values(handoff.authority).every((value) => value === false) &&
    (handoff.reallocationReview == null || Object.values(handoff.reallocationReview.authority).every((value) => value === false));
}

export function certifyExperimentReallocationSuccessIntegrityV1(input: {
  portfolio: ExperimentPortfolioV1;
  experiment: ExperimentCandidateV1;
  handoff: ExperimentReallocationHandoffV1;
  generatedAt: string;
}): Readonly<ExperimentReallocationSuccessIntegrityV1> {
  if (input.portfolio.contractVersion !== "ExperimentPortfolioV1") {
    throw new ExperimentReallocationSuccessIntegrityError(
      "INVALID_EXPERIMENT_PORTFOLIO",
      "portfolio must be ExperimentPortfolioV1"
    );
  }
  if (input.portfolio.policyVersion !== EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1) {
    throw new ExperimentReallocationSuccessIntegrityError(
      "EXPERIMENT_PORTFOLIO_POLICY_MISMATCH",
      "experiment portfolio policy is not current"
    );
  }
  if (input.portfolio.decisionPortfolio.contractVersion !== "DecisionPortfolioV1" ||
      input.portfolio.decisionPortfolio.policyVersion !== DECISION_PORTFOLIO_POLICY_VERSION_V1) {
    throw new ExperimentReallocationSuccessIntegrityError(
      "DECISION_PORTFOLIO_POLICY_MISMATCH",
      "decision portfolio policy is not current"
    );
  }
  if (input.handoff.contractVersion !== "ExperimentReallocationHandoffV1" ||
      input.handoff.policyVersion !== EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1) {
    throw new ExperimentReallocationSuccessIntegrityError(
      "HANDOFF_POLICY_MISMATCH",
      "experiment reallocation handoff policy is not current"
    );
  }

  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  const experiment = structuredClone(input.experiment) as ExperimentCandidateV1;
  const experimentId = text(experiment.id, "experiment.id");
  const reasons = new Set<string>();
  const waitReasons = new Set<string>();

  if (Date.parse(generatedAt) < Date.parse(input.portfolio.generatedAt)) {
    reasons.add("CERTIFICATION_BEFORE_EXPERIMENT_PORTFOLIO");
  }
  if (Date.parse(generatedAt) < Date.parse(input.handoff.generatedAt)) {
    reasons.add("CERTIFICATION_BEFORE_HANDOFF");
  }

  if (input.handoff.experimentPortfolioId !== input.portfolio.portfolioId) {
    reasons.add("EXPERIMENT_PORTFOLIO_IDENTITY_MISMATCH");
  }
  if (input.handoff.decisionPortfolioId !== input.portfolio.decisionPortfolio.portfolioId) {
    reasons.add("DECISION_PORTFOLIO_IDENTITY_MISMATCH");
  }
  if (input.handoff.experimentId !== experimentId || experiment.decisionCandidate.id !== experimentId) {
    reasons.add("EXPERIMENT_IDENTITY_MISMATCH");
  }

  const portfolioItems = input.portfolio.items.filter((item) => item.experimentId === experimentId);
  const decisionItems = input.portfolio.decisionPortfolio.items.filter(
    (item) => item.candidate.id === experimentId
  );
  if (portfolioItems.length !== 1) reasons.add("EXPERIMENT_PORTFOLIO_ITEM_IDENTITY_MISMATCH");
  if (decisionItems.length !== 1) reasons.add("DECISION_PORTFOLIO_ITEM_IDENTITY_MISMATCH");

  if (!authorityIsSafe(input.handoff)) reasons.add("AUTHORITY_WIDENED");

  if (input.handoff.status === "WAIT") waitReasons.add("HANDOFF_WAITING");
  if (input.handoff.status === "VERIFY_REQUIRED") reasons.add("HANDOFF_VERIFICATION_REQUIRED");

  const observation = experiment.observation;
  if (!observation) {
    waitReasons.add("OBSERVATION_NOT_AVAILABLE");
  }

  const rule = experiment.successRule;
  let observedSuccessCriterionState: DecisionSuccessCriterionStateV1 | null = null;
  let ruleProjection: ExperimentReallocationSuccessIntegrityV1["successRule"] = null;
  let evidenceRefs: string[] = [];
  let sourceRefs: string[] = [];

  if (observation) {
    const observedAt = timestamp(observation.observedAt, `${experimentId}.observation.observedAt`);
    const notBeforeAt = timestamp(rule.notBeforeAt, `${experimentId}.successRule.notBeforeAt`);
    if (Date.parse(observedAt) > Date.parse(generatedAt)) reasons.add("OBSERVATION_FROM_FUTURE");
    if (observation.truthState !== "KNOWN") reasons.add(`OBSERVATION_${observation.truthState}`);
    if (observation.metric !== rule.metric || observation.unit !== rule.unit) {
      reasons.add("SUCCESS_RULE_METRIC_IDENTITY_MISMATCH");
    }
    if (!Number.isFinite(observation.value)) reasons.add("OBSERVATION_VALUE_INVALID");
    if (!Number.isSafeInteger(observation.sampleSize) || observation.sampleSize < 1) {
      reasons.add("OBSERVATION_SAMPLE_INVALID");
    }
    if (!Number.isSafeInteger(rule.minimumSampleSize) || rule.minimumSampleSize < 1) {
      reasons.add("SUCCESS_RULE_SAMPLE_INVALID");
    }
    if (!Number.isFinite(rule.threshold)) reasons.add("SUCCESS_RULE_THRESHOLD_INVALID");
    if (Date.parse(observedAt) < Date.parse(notBeforeAt)) waitReasons.add("SUCCESS_WINDOW_NOT_MATURE");
    if (observation.sampleSize < rule.minimumSampleSize) waitReasons.add("SUCCESS_SAMPLE_NOT_MATURE");

    const observationRefs = refs(observation.evidenceRefs, `${experimentId}.observation.evidenceRefs`);
    const ruleRefs = refs(rule.evidenceRefs, `${experimentId}.successRule.evidenceRefs`);
    const portfolioEvidence = new Set(input.portfolio.evidenceRefs);
    if ([...observationRefs, ...ruleRefs].some((ref) => !portfolioEvidence.has(ref))) {
      reasons.add("SUCCESS_EVIDENCE_NOT_IN_PORTFOLIO");
    }

    sourceRefs = refs(experiment.decisionCandidate.sourceRefs, `${experimentId}.decisionCandidate.sourceRefs`);
    const portfolioSources = new Set(input.portfolio.sourceRefs);
    if (sourceRefs.some((ref) => !portfolioSources.has(ref))) {
      reasons.add("DECISION_SOURCE_NOT_IN_PORTFOLIO");
    }

    evidenceRefs = [...new Set([...observationRefs, ...ruleRefs])].sort((a, b) => a.localeCompare(b));
    observedSuccessCriterionState = mechanicalSuccessState(rule, observation);
    ruleProjection = {
      ruleId: text(rule.id, `${experimentId}.successRule.id`),
      metric: text(rule.metric, `${experimentId}.successRule.metric`),
      unit: text(rule.unit, `${experimentId}.successRule.unit`),
      comparator: rule.comparator,
      threshold: rule.threshold,
      minimumSampleSize: rule.minimumSampleSize,
      notBeforeAt
    };
  }

  if (input.handoff.status === "READY_FOR_REALLOCATION_REVIEW") {
    if (!input.handoff.outcome || !input.handoff.reallocationReview) {
      reasons.add("READY_HANDOFF_MISSING_OUTCOME_OR_REVIEW");
    }
  }

  if (observation && input.handoff.outcome) {
    const outcome = input.handoff.outcome;
    if (outcome.candidateId !== experimentId) reasons.add("OUTCOME_CANDIDATE_IDENTITY_MISMATCH");
    if (outcome.measuredAt !== observation.observedAt) reasons.add("OUTCOME_OBSERVATION_TIME_MISMATCH");
    if (outcome.evidenceState !== "KNOWN") reasons.add(`OUTCOME_${outcome.evidenceState}`);
    if (observedSuccessCriterionState !== outcome.successCriterionState) {
      reasons.add("SUCCESS_CRITERION_STATE_MISMATCH");
    }
    const handoffOutcomeRefs = refs(outcome.evidenceRefs, `${experimentId}.handoff.outcome.evidenceRefs`);
    const observationRefs = refs(observation.evidenceRefs, `${experimentId}.observation.evidenceRefs`);
    if (observationRefs.some((ref) => !handoffOutcomeRefs.includes(ref))) {
      reasons.add("HANDOFF_OUTCOME_MISSING_OBSERVATION_EVIDENCE");
    }
  }

  if (input.handoff.reallocationReview) {
    const review = input.handoff.reallocationReview;
    if (review.policyVersion !== DECISION_PORTFOLIO_REALLOCATION_POLICY_VERSION_V1) {
      reasons.add("REALLOCATION_POLICY_MISMATCH");
    }
    if (review.sourcePortfolioId !== input.portfolio.decisionPortfolio.portfolioId) {
      reasons.add("REALLOCATION_SOURCE_PORTFOLIO_MISMATCH");
    }
    if (input.handoff.outcome) {
      const matchingReviews = review.candidateReviews.filter(
        (candidateReview) =>
          candidateReview.candidateId === experimentId &&
          candidateReview.outcomeId === input.handoff.outcome?.outcomeId
      );
      if (matchingReviews.length !== 1) reasons.add("REALLOCATION_CANDIDATE_REVIEW_IDENTITY_MISMATCH");
    }
  }

  let status: ExperimentReallocationSuccessIntegrityStatusV1;
  if (reasons.size > 0) status = "VERIFY_REQUIRED";
  else if (waitReasons.size > 0) status = "WAIT";
  else status = "CERTIFIED_FOR_REALLOCATION_REVIEW";

  const reasonList = [...reasons, ...waitReasons].sort((a, b) => a.localeCompare(b));
  const certifiedReallocationReviewId =
    status === "CERTIFIED_FOR_REALLOCATION_REVIEW"
      ? input.handoff.reallocationReview?.reviewId ?? null
      : null;

  const identity = canonical({
    policyVersion: EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_POLICY_VERSION_V1,
    generatedAt,
    experimentPortfolioId: input.portfolio.portfolioId,
    decisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    experimentId,
    handoffId: input.handoff.handoffId,
    status,
    reasons: reasonList,
    observedSuccessCriterionState,
    certifiedReallocationReviewId,
    evidenceRefs,
    sourceRefs
  });

  return freeze({
    contractVersion: EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_CONTRACT_VERSION_V1,
    policyVersion: EXPERIMENT_REALLOCATION_SUCCESS_INTEGRITY_POLICY_VERSION_V1,
    certificationId: `experiment-reallocation-success-integrity:${createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex")
      .slice(0, 24)}`,
    generatedAt,
    experimentPortfolioId: input.portfolio.portfolioId,
    decisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    experimentId,
    handoffId: input.handoff.handoffId,
    status,
    reasons: reasonList,
    successRule: ruleProjection,
    observedSuccessCriterionState,
    certifiedReallocationReviewId,
    evidenceRefs,
    sourceRefs,
    authority: {
      mutateExperiment: false,
      mutatePortfolio: false,
      changeAllocation: false,
      changeSpend: false,
      changePrice: false,
      publish: false,
      sendOutreach: false,
      promotePolicy: false,
      inferCausality: false,
      inferConfidence: false,
      inferMonetaryValue: false,
      externalAction: false,
      approvalBypass: false
    }
  });
}

import { createHash } from "node:crypto";

import type {
  ExperimentAttributionClassV1,
  ExperimentCandidateV1,
  ExperimentPortfolioItemV1,
  ExperimentPortfolioV1
} from "./experiment-portfolio-v1";
import {
  reviewDecisionPortfolioReallocationV1,
  type DecisionAssumptionUpdateV1,
  type DecisionAttributionClassV1,
  type DecisionOutcomeMaterialityV1,
  type DecisionOutcomeObservationV1,
  type DecisionOutcomeResultV1,
  type DecisionPortfolioReallocationReviewV1,
  type DecisionSuccessCriterionStateV1
} from "../strategy-engine/decision-portfolio-reallocation-v1";
import type { DecisionEvidenceStateV1 } from "../strategy-engine/decision-portfolio-v1";

export const EXPERIMENT_REALLOCATION_HANDOFF_CONTRACT_VERSION_V1 =
  "ExperimentReallocationHandoffV1" as const;
export const EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1 =
  "experiment_reallocation_handoff_policy_v1.0.0" as const;

const MAX_REFS = 100;

export type ExperimentOutcomeAssessmentV1 = {
  assessedAt: string;
  evidenceState: DecisionEvidenceStateV1;
  freshness: "CURRENT" | "STALE" | "UNKNOWN";
  result: DecisionOutcomeResultV1;
  successCriterionState: DecisionSuccessCriterionStateV1;
  materiality: DecisionOutcomeMaterialityV1;
  classificationEvidenceRefs: readonly string[];
  materialityEvidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  confounderRefs: readonly string[];
  assumptionUpdates: readonly DecisionAssumptionUpdateV1[];
};

export type ExperimentReallocationHandoffStatusV1 =
  | "WAIT"
  | "VERIFY_REQUIRED"
  | "READY_FOR_REALLOCATION_REVIEW";

export type ExperimentReallocationHandoffV1 = {
  contractVersion: typeof EXPERIMENT_REALLOCATION_HANDOFF_CONTRACT_VERSION_V1;
  policyVersion: typeof EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1;
  handoffId: string;
  generatedAt: string;
  experimentPortfolioId: string;
  decisionPortfolioId: string;
  experimentId: string;
  status: ExperimentReallocationHandoffStatusV1;
  reasons: readonly string[];
  outcome: DecisionOutcomeObservationV1 | null;
  reallocationReview: DecisionPortfolioReallocationReviewV1 | null;
  authority: {
    launchExperiment: false;
    mutatePortfolio: false;
    changeAllocation: false;
    changeSpend: false;
    changePrice: false;
    publish: false;
    sendOutreach: false;
    promotePolicy: false;
    inferCausality: false;
    approvalBypass: false;
  };
};

export class ExperimentReallocationHandoffError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExperimentReallocationHandoffError";
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentReallocationHandoffError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = text(value, label);
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== normalized) {
    throw new ExperimentReallocationHandoffError("INVALID_TIMESTAMP", `${label} must be a canonical ISO timestamp`);
  }
  return normalized;
}

function refs(values: readonly string[], label: string, allowEmpty = false): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS || (!allowEmpty && values.length === 0)) {
    throw new ExperimentReallocationHandoffError(
      "INVALID_REFS",
      `${label} must be ${allowEmpty ? "a bounded" : "a non-empty bounded"} list`
    );
  }
  const normalized = values.map((value) => text(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new ExperimentReallocationHandoffError("DUPLICATE_REF", `${label} contains duplicate references`);
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

function attributionClass(value: ExperimentAttributionClassV1): DecisionAttributionClassV1 {
  switch (value) {
    case "CAUSAL_SUPPORTED":
      return "CAUSAL";
    case "CORRELATIONAL":
      return "CORRELATIONAL";
    case "NOT_ESTABLISHED":
      return "NOT_ESTABLISHED";
  }
}

function itemFor(portfolio: ExperimentPortfolioV1, experimentId: string): ExperimentPortfolioItemV1 {
  const items = portfolio.items.filter((item) => item.experimentId === experimentId);
  if (items.length !== 1) {
    throw new ExperimentReallocationHandoffError(
      "EXPERIMENT_PORTFOLIO_IDENTITY_MISMATCH",
      `${experimentId} must appear exactly once in the experiment portfolio`
    );
  }
  return items[0]!;
}

function setStatus(reasons: Set<string>, waitReasons: Set<string>): ExperimentReallocationHandoffStatusV1 {
  if (reasons.size > 0) return "VERIFY_REQUIRED";
  if (waitReasons.size > 0) return "WAIT";
  return "READY_FOR_REALLOCATION_REVIEW";
}

function immutableAuthority(): ExperimentReallocationHandoffV1["authority"] {
  return {
    launchExperiment: false,
    mutatePortfolio: false,
    changeAllocation: false,
    changeSpend: false,
    changePrice: false,
    publish: false,
    sendOutreach: false,
    promotePolicy: false,
    inferCausality: false,
    approvalBypass: false
  };
}

export function prepareExperimentReallocationHandoffV1(input: {
  portfolio: ExperimentPortfolioV1;
  experiment: ExperimentCandidateV1;
  assessment: ExperimentOutcomeAssessmentV1 | null;
  generatedAt: string;
}): Readonly<ExperimentReallocationHandoffV1> {
  if (input.portfolio.contractVersion !== "ExperimentPortfolioV1") {
    throw new ExperimentReallocationHandoffError("INVALID_EXPERIMENT_PORTFOLIO", "experiment portfolio contract is invalid");
  }
  if (input.portfolio.decisionPortfolio.contractVersion !== "DecisionPortfolioV1") {
    throw new ExperimentReallocationHandoffError("INVALID_DECISION_PORTFOLIO", "decision portfolio contract is invalid");
  }

  const generatedAt = timestamp(input.generatedAt, "generatedAt");
  if (Date.parse(generatedAt) < Date.parse(input.portfolio.generatedAt)) {
    throw new ExperimentReallocationHandoffError(
      "HANDOFF_BEFORE_PORTFOLIO",
      "handoff cannot precede the experiment portfolio"
    );
  }

  const experiment = structuredClone(input.experiment) as ExperimentCandidateV1;
  const experimentId = text(experiment.id, "experiment.id");
  if (experiment.decisionCandidate.id !== experimentId || experiment.decisionCandidate.candidateType !== "EXPERIMENT") {
    throw new ExperimentReallocationHandoffError(
      "DECISION_IDENTITY_MISMATCH",
      `${experimentId} must use the matching EXPERIMENT decision candidate`
    );
  }

  const item = itemFor(input.portfolio, experimentId);
  if (item.decisionCandidateId !== experiment.decisionCandidate.id) {
    throw new ExperimentReallocationHandoffError(
      "DECISION_IDENTITY_MISMATCH",
      `${experimentId} portfolio item references a different decision candidate`
    );
  }
  const sourceDecisionItems = input.portfolio.decisionPortfolio.items.filter(
    (decisionItem) => decisionItem.candidate.id === experimentId
  );
  if (sourceDecisionItems.length !== 1) {
    throw new ExperimentReallocationHandoffError(
      "DECISION_PORTFOLIO_IDENTITY_MISMATCH",
      `${experimentId} must appear exactly once in the source decision portfolio`
    );
  }

  const reasons = new Set<string>();
  const waitReasons = new Set<string>();
  const observation = experiment.observation;

  if (item.preRegistrationState !== "VALID" || item.verificationReasons.length > 0 || item.reviewState === "VERIFY_REQUIRED") {
    reasons.add("EXPERIMENT_VERIFICATION_REQUIRED");
  }
  if (!observation) {
    waitReasons.add("OBSERVATION_NOT_AVAILABLE");
  } else {
    const observedAt = timestamp(observation.observedAt, `${experimentId}.observation.observedAt`);
    if (Date.parse(observedAt) > Date.parse(generatedAt)) reasons.add("OBSERVATION_FROM_FUTURE");
    if (observation.truthState !== "KNOWN") reasons.add(`OBSERVATION_${observation.truthState}`);
    const observationEvidence = refs(observation.evidenceRefs, `${experimentId}.observation.evidenceRefs`);
    const portfolioEvidence = new Set(input.portfolio.evidenceRefs);
    if (observationEvidence.some((ref) => !portfolioEvidence.has(ref))) {
      reasons.add("OBSERVATION_PROVENANCE_NOT_IN_PORTFOLIO");
    }
    if (item.attributionClass !== observation.attributionClass) reasons.add("ATTRIBUTION_CLASS_MISMATCH");
    const causalExpected =
      observation.attributionClass === "CAUSAL_SUPPORTED" &&
      experiment.comparisonDesign.kind === "RANDOMIZED_HOLDOUT";
    if (item.causalClaimAllowed !== causalExpected) reasons.add("CAUSAL_AUTHORITY_MISMATCH");
    const decisionSources = refs(experiment.decisionCandidate.sourceRefs, `${experimentId}.decisionCandidate.sourceRefs`);
    const portfolioSources = new Set(input.portfolio.sourceRefs);
    if (decisionSources.some((ref) => !portfolioSources.has(ref))) {
      reasons.add("DECISION_PROVENANCE_NOT_IN_PORTFOLIO");
    }
    if (item.reviewState === "NOT_EVALUATED" || item.reviewState === "WAITING_FOR_WINDOW") {
      waitReasons.add("EXPERIMENT_EVALUATION_NOT_MATURE");
    }
  }

  if (!input.assessment) {
    waitReasons.add("OUTCOME_ASSESSMENT_REQUIRED");
  }

  let outcome: DecisionOutcomeObservationV1 | null = null;
  let reallocationReview: DecisionPortfolioReallocationReviewV1 | null = null;

  if (observation && input.assessment) {
    const assessment = structuredClone(input.assessment) as ExperimentOutcomeAssessmentV1;
    const assessedAt = timestamp(assessment.assessedAt, `${experimentId}.assessment.assessedAt`);
    if (Date.parse(assessedAt) > Date.parse(generatedAt)) reasons.add("ASSESSMENT_FROM_FUTURE");
    if (Date.parse(assessedAt) < Date.parse(observation.observedAt)) reasons.add("ASSESSMENT_BEFORE_OBSERVATION");
    if (assessment.evidenceState !== "KNOWN") reasons.add(`ASSESSMENT_${assessment.evidenceState}`);
    if (assessment.freshness !== "CURRENT") reasons.add(`ASSESSMENT_${assessment.freshness}`);

    const classificationEvidenceRefs = refs(
      assessment.classificationEvidenceRefs,
      `${experimentId}.assessment.classificationEvidenceRefs`
    );
    const materialityEvidenceRefs = refs(
      assessment.materialityEvidenceRefs,
      `${experimentId}.assessment.materialityEvidenceRefs`,
      assessment.materiality !== "MATERIAL"
    );
    const sourceRefs = refs(assessment.sourceRefs, `${experimentId}.assessment.sourceRefs`);
    const confounderRefs = refs(assessment.confounderRefs, `${experimentId}.assessment.confounderRefs`, true);

    if (assessment.materiality === "UNKNOWN") reasons.add("MATERIALITY_UNKNOWN");
    if (assessment.materiality === "MATERIAL" && materialityEvidenceRefs.length === 0) {
      reasons.add("MATERIALITY_EVIDENCE_REQUIRED");
    }
    if (experiment.knownConfounders.length + observation.confounders.length > 0 && confounderRefs.length === 0) {
      reasons.add("CONFOUNDER_EVIDENCE_REQUIRED");
    }

    const observationEvidenceRefs = refs(observation.evidenceRefs, `${experimentId}.observation.evidenceRefs`);
    const attributionEvidenceRefs = refs(
      observation.attributionEvidenceRefs,
      `${experimentId}.observation.attributionEvidenceRefs`,
      observation.attributionClass === "NOT_ESTABLISHED"
    );
    const decisionSourceRefs = refs(experiment.decisionCandidate.sourceRefs, `${experimentId}.decisionCandidate.sourceRefs`);
    const allSourceRefs = [...new Set([...decisionSourceRefs, ...sourceRefs])].sort((a, b) => a.localeCompare(b));
    const allEvidenceRefs = [...new Set([...observationEvidenceRefs, ...classificationEvidenceRefs])].sort((a, b) => a.localeCompare(b));

    if (reasons.size === 0 && waitReasons.size === 0) {
      const outcomeIdentity = canonical({
        policyVersion: EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1,
        experimentPortfolioId: input.portfolio.portfolioId,
        decisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
        experimentId,
        observedAt: observation.observedAt,
        assessedAt,
        result: assessment.result,
        successCriterionState: assessment.successCriterionState,
        materiality: assessment.materiality,
        attributionClass: observation.attributionClass,
        evidenceRefs: allEvidenceRefs,
        sourceRefs: allSourceRefs
      });
      const outcomeId = `experiment-outcome:${createHash("sha256")
        .update(JSON.stringify(outcomeIdentity))
        .digest("hex")
        .slice(0, 24)}`;

      outcome = {
        outcomeId,
        candidateId: experimentId,
        measuredAt: observation.observedAt,
        evidenceState: "KNOWN",
        evidenceRefs: allEvidenceRefs,
        sourceRefs: allSourceRefs,
        result: assessment.result,
        successCriterionState: assessment.successCriterionState,
        materiality: assessment.materiality,
        materialityEvidenceRefs,
        attributionClass: attributionClass(observation.attributionClass),
        attributionEvidenceRefs,
        confounderRefs,
        assumptionUpdates: structuredClone(assessment.assumptionUpdates)
      };

      reallocationReview = reviewDecisionPortfolioReallocationV1({
        portfolio: input.portfolio.decisionPortfolio,
        outcomes: [outcome],
        reviewedAt: generatedAt
      });

      if (reallocationReview.status === "VERIFICATION_REQUIRED") {
        reasons.add("DOWNSTREAM_REALLOCATION_VERIFICATION_REQUIRED");
        outcome = null;
        reallocationReview = null;
      }
    }
  }

  const status = setStatus(reasons, waitReasons);
  if (status !== "READY_FOR_REALLOCATION_REVIEW") {
    outcome = null;
    reallocationReview = null;
  }

  const reasonList = [...reasons, ...waitReasons].sort((a, b) => a.localeCompare(b));
  const handoffIdentity = canonical({
    policyVersion: EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1,
    generatedAt,
    experimentPortfolioId: input.portfolio.portfolioId,
    decisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    experimentId,
    status,
    reasons: reasonList,
    outcomeId: outcome?.outcomeId ?? null,
    reallocationReviewId: reallocationReview?.reviewId ?? null
  });

  return freeze({
    contractVersion: EXPERIMENT_REALLOCATION_HANDOFF_CONTRACT_VERSION_V1,
    policyVersion: EXPERIMENT_REALLOCATION_HANDOFF_POLICY_VERSION_V1,
    handoffId: `experiment-reallocation-handoff:${createHash("sha256")
      .update(JSON.stringify(handoffIdentity))
      .digest("hex")
      .slice(0, 24)}`,
    generatedAt,
    experimentPortfolioId: input.portfolio.portfolioId,
    decisionPortfolioId: input.portfolio.decisionPortfolio.portfolioId,
    experimentId,
    status,
    reasons: reasonList,
    outcome,
    reallocationReview,
    authority: immutableAuthority()
  });
}

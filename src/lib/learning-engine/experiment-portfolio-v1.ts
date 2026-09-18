import { createHash } from "node:crypto";

export const EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1 = "experiment_portfolio_policy_v1.0.0" as const;

export type ExperimentTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "PARTIAL" | "CONFLICTED";
export type ExperimentOwnerV1 = "KEEGAN" | "IOANA" | "JEEVES";
export type ExperimentApprovalClassV1 = "NONE" | "REVIEW" | "KEEGAN";
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
export type ExperimentDesignTypeV1 = "RANDOMIZED_HOLDOUT" | "MATCHED_CONTROL" | "PRE_POST" | "OBSERVATIONAL";
export type ExperimentAttributionClassV1 = "RANDOMIZED" | "QUASI_EXPERIMENTAL" | "CORRELATIONAL" | "UNKNOWN";
export type ExperimentCriterionOperatorV1 = "GTE" | "LTE";
export type ExperimentDispositionV1 = "SELECTED" | "DEFERRED_CAPACITY" | "VERIFY" | "BLOCKED";

export type ExperimentCriterionV1 = {
  operator: ExperimentCriterionOperatorV1;
  threshold: number;
  evidenceRefs: readonly string[];
};

export type ExperimentCandidateV1 = {
  id: string;
  title: string;
  domain: ExperimentDomainV1;
  owner: ExperimentOwnerV1;
  approvalClass: ExperimentApprovalClassV1;
  truthState: ExperimentTruthStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  hypothesis: string;
  causalMechanismHypothesis: string;
  design: {
    type: ExperimentDesignTypeV1;
    controlDefinition: string | null;
    assignmentMethod: string;
    evidenceRefs: readonly string[];
  };
  primaryMetric: {
    id: string;
    unit: string;
  };
  criteria: {
    success: ExperimentCriterionV1;
    stop: ExperimentCriterionV1;
    scale: ExperimentCriterionV1;
  };
  preRegistration: {
    registeredAt: string;
    evidenceRefs: readonly string[];
  };
  evaluationWindow: {
    start: string;
    earliestDecisionAt: string;
    end: string;
  };
  minimumSampleSize: number;
  resources: {
    keeganHours: number;
    ioanaHours: number;
    jeevesHours: number;
    cashCents: number;
    exposureCount: number;
  };
  priorityPoints: number;
  priorityEvidenceRefs: readonly string[];
  dependencyIds: readonly string[];
  conflictKeys: readonly string[];
  blockers: readonly string[];
  confoundersToTrack: readonly string[];
  attributionPlan: {
    targetClass: ExperimentAttributionClassV1;
    evidenceRefs: readonly string[];
  };
  rollbackPlan: string;
  safeNextStep: string;
};

export type ExperimentPortfolioCapacityV1 = {
  maxConcurrent: number;
  keeganHours: number;
  ioanaHours: number;
  jeevesHours: number;
  cashCents: number;
  exposureCount: number;
};

export type ExperimentPortfolioItemV1 = {
  candidate: ExperimentCandidateV1;
  disposition: ExperimentDispositionV1;
  rank: number;
  exclusionReason: string | null;
  verificationReasons: readonly string[];
};

export type ExperimentPortfolioV1 = {
  contractVersion: "ExperimentPortfolioV1";
  policyVersion: typeof EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1;
  generatedAt: string;
  portfolioId: string;
  items: readonly ExperimentPortfolioItemV1[];
  selectedIds: readonly string[];
  usedCapacity: Omit<ExperimentPortfolioCapacityV1, "maxConcurrent">;
  remainingCapacity: Omit<ExperimentPortfolioCapacityV1, "maxConcurrent">;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  audit: {
    candidatesConsidered: number;
    feasiblePortfoliosEvaluated: number;
    priorityMeaning: "CALLER_SUPPLIED_DECISION_PRIORITY_NOT_CONFIDENCE_OR_MONETARY_VALUE";
  };
  authority: {
    launch: false;
    spend: false;
    pricing: false;
    send: false;
    publish: false;
    externalAction: false;
    policyPromotion: false;
    approvalBypass: false;
  };
};

export type ExperimentObservationV1 = {
  experimentId: string;
  observedAt: string;
  completionState: "INTERIM" | "FINAL";
  truthState: ExperimentTruthStateV1;
  evidenceRefs: readonly string[];
  sampleSize: number;
  metric: {
    id: string;
    unit: string;
    value: number | null;
  };
  attributionClass: ExperimentAttributionClassV1;
  attributionEvidenceRefs: readonly string[];
  confounders: readonly string[];
};

export type ExperimentOutcomeDecisionV1 = {
  experimentId: string;
  decision: "VERIFY" | "CONTINUE" | "STOP_REVIEW" | "SCALE_REVIEW" | "HOLD_REVIEW" | "INCONCLUSIVE";
  reasons: readonly string[];
  successCriterionMet: boolean | null;
  stopCriterionMet: boolean | null;
  scaleCriterionMet: boolean | null;
  attributionClass: ExperimentAttributionClassV1;
  causalReviewState: "NOT_ESTABLISHED" | "REVIEW_ELIGIBLE";
  confounders: readonly string[];
  policyUpdateAuthorized: false;
  externalActionAuthorized: false;
};

export type ShadowPolicyOutcomeEvidenceV1 = {
  experimentId: string;
  outcomeRef: string;
  observedAt: string;
  truthState: ExperimentTruthStateV1;
  attributionClass: ExperimentAttributionClassV1;
  evidenceRefs: readonly string[];
};

export type ShadowPolicyReviewV1 = {
  policyCandidateId: string;
  state: "INSUFFICIENT_EVIDENCE" | "VERIFY" | "SHADOW_REVIEW_READY";
  reasons: readonly string[];
  independentExperimentIds: readonly string[];
  supportingOutcomeRefs: readonly string[];
  shadowEvaluationPlan: string;
  rollbackPlan: string;
  reviewRequired: true;
  shadowOnly: true;
  promotionAuthorized: false;
  externalActionAuthorized: false;
};

export class ExperimentPortfolioError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ExperimentPortfolioError";
  }
}

const MAX_CANDIDATES = 16;
const MAX_REFS = 100;

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExperimentPortfolioError("REQUIRED_TEXT", `${label} is required`);
  }
  return value.trim();
}

function canonicalTimestamp(value: unknown, label: string): string {
  const text = requiredText(value, label);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new ExperimentPortfolioError("INVALID_TIMESTAMP", `${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function numberInRange(value: unknown, label: string, minimum: number, maximum: number, integer = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw new ExperimentPortfolioError("INVALID_NUMBER", `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new ExperimentPortfolioError("INVALID_REFS", `${label} is invalid`);
  }
  const normalized = values.map((value) => requiredText(value, `${label} item`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ExperimentPortfolioError("DUPLICATE_REF", `${label} contains a duplicate`);
  }
  return [...normalized].sort((a, b) => a.localeCompare(b));
}

function textList(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) {
    throw new ExperimentPortfolioError("INVALID_LIST", `${label} is invalid`);
  }
  return [...new Set(values.map((value) => requiredText(value, `${label} item`)))].sort((a, b) => a.localeCompare(b));
}

function criterion(value: ExperimentCriterionV1, label: string): ExperimentCriterionV1 {
  if (!new Set<ExperimentCriterionOperatorV1>(["GTE", "LTE"]).has(value.operator)) {
    throw new ExperimentPortfolioError("INVALID_CRITERION", `${label}.operator is invalid`);
  }
  return {
    operator: value.operator,
    threshold: numberInRange(value.threshold, `${label}.threshold`, -1e15, 1e15),
    evidenceRefs: refs(value.evidenceRefs, `${label}.evidenceRefs`)
  };
}

function normalizeCandidate(candidate: ExperimentCandidateV1, generatedAtMs: number): ExperimentCandidateV1 {
  const id = requiredText(candidate.id, "candidate.id");
  if (!new Set<ExperimentDomainV1>(["WEBSITE", "EMAIL", "PAID_MEDIA", "OFFER", "PRICING_PRESENTATION", "LAUNCH", "RELATIONSHIP", "CONTENT", "WORKFLOW"]).has(candidate.domain)) {
    throw new ExperimentPortfolioError("INVALID_DOMAIN", `${id}.domain is invalid`);
  }
  if (!new Set<ExperimentOwnerV1>(["KEEGAN", "IOANA", "JEEVES"]).has(candidate.owner)) {
    throw new ExperimentPortfolioError("INVALID_OWNER", `${id}.owner is invalid`);
  }
  if (!new Set<ExperimentApprovalClassV1>(["NONE", "REVIEW", "KEEGAN"]).has(candidate.approvalClass)) {
    throw new ExperimentPortfolioError("INVALID_APPROVAL", `${id}.approvalClass is invalid`);
  }
  if (!new Set<ExperimentTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "PARTIAL", "CONFLICTED"]).has(candidate.truthState)) {
    throw new ExperimentPortfolioError("INVALID_TRUTH_STATE", `${id}.truthState is invalid`);
  }
  if (!new Set<ExperimentDesignTypeV1>(["RANDOMIZED_HOLDOUT", "MATCHED_CONTROL", "PRE_POST", "OBSERVATIONAL"]).has(candidate.design.type)) {
    throw new ExperimentPortfolioError("INVALID_DESIGN", `${id}.design.type is invalid`);
  }
  if (!new Set<ExperimentAttributionClassV1>(["RANDOMIZED", "QUASI_EXPERIMENTAL", "CORRELATIONAL", "UNKNOWN"]).has(candidate.attributionPlan.targetClass)) {
    throw new ExperimentPortfolioError("INVALID_ATTRIBUTION", `${id}.attributionPlan.targetClass is invalid`);
  }

  const registeredAt = canonicalTimestamp(candidate.preRegistration.registeredAt, `${id}.preRegistration.registeredAt`);
  if (Date.parse(registeredAt) > generatedAtMs) {
    throw new ExperimentPortfolioError("FUTURE_PREREGISTRATION", `${id} pre-registration is future-dated`);
  }
  const start = canonicalTimestamp(candidate.evaluationWindow.start, `${id}.evaluationWindow.start`);
  const earliestDecisionAt = canonicalTimestamp(candidate.evaluationWindow.earliestDecisionAt, `${id}.evaluationWindow.earliestDecisionAt`);
  const end = canonicalTimestamp(candidate.evaluationWindow.end, `${id}.evaluationWindow.end`);
  if (!(Date.parse(start) <= Date.parse(earliestDecisionAt) && Date.parse(earliestDecisionAt) <= Date.parse(end))) {
    throw new ExperimentPortfolioError("INVALID_WINDOW", `${id} evaluation window is unordered`);
  }
  if (Date.parse(registeredAt) > Date.parse(start)) {
    throw new ExperimentPortfolioError("LATE_PREREGISTRATION", `${id} must be pre-registered before the evaluation starts`);
  }

  const normalized: ExperimentCandidateV1 = {
    id,
    title: requiredText(candidate.title, `${id}.title`),
    domain: candidate.domain,
    owner: candidate.owner,
    approvalClass: candidate.approvalClass,
    truthState: candidate.truthState,
    evidenceRefs: refs(candidate.evidenceRefs, `${id}.evidenceRefs`),
    sourceRefs: refs(candidate.sourceRefs, `${id}.sourceRefs`),
    hypothesis: requiredText(candidate.hypothesis, `${id}.hypothesis`),
    causalMechanismHypothesis: requiredText(candidate.causalMechanismHypothesis, `${id}.causalMechanismHypothesis`),
    design: {
      type: candidate.design.type,
      controlDefinition: candidate.design.controlDefinition == null ? null : requiredText(candidate.design.controlDefinition, `${id}.design.controlDefinition`),
      assignmentMethod: requiredText(candidate.design.assignmentMethod, `${id}.design.assignmentMethod`),
      evidenceRefs: refs(candidate.design.evidenceRefs, `${id}.design.evidenceRefs`)
    },
    primaryMetric: {
      id: requiredText(candidate.primaryMetric.id, `${id}.primaryMetric.id`),
      unit: requiredText(candidate.primaryMetric.unit, `${id}.primaryMetric.unit`)
    },
    criteria: {
      success: criterion(candidate.criteria.success, `${id}.criteria.success`),
      stop: criterion(candidate.criteria.stop, `${id}.criteria.stop`),
      scale: criterion(candidate.criteria.scale, `${id}.criteria.scale`)
    },
    preRegistration: {
      registeredAt,
      evidenceRefs: refs(candidate.preRegistration.evidenceRefs, `${id}.preRegistration.evidenceRefs`)
    },
    evaluationWindow: { start, earliestDecisionAt, end },
    minimumSampleSize: numberInRange(candidate.minimumSampleSize, `${id}.minimumSampleSize`, 1, 100_000_000, true),
    resources: {
      keeganHours: numberInRange(candidate.resources.keeganHours, `${id}.resources.keeganHours`, 0, 10_000),
      ioanaHours: numberInRange(candidate.resources.ioanaHours, `${id}.resources.ioanaHours`, 0, 10_000),
      jeevesHours: numberInRange(candidate.resources.jeevesHours, `${id}.resources.jeevesHours`, 0, 100_000),
      cashCents: numberInRange(candidate.resources.cashCents, `${id}.resources.cashCents`, 0, 100_000_000_000, true),
      exposureCount: numberInRange(candidate.resources.exposureCount, `${id}.resources.exposureCount`, 0, 100_000_000, true)
    },
    priorityPoints: numberInRange(candidate.priorityPoints, `${id}.priorityPoints`, 0, 100),
    priorityEvidenceRefs: refs(candidate.priorityEvidenceRefs, `${id}.priorityEvidenceRefs`),
    dependencyIds: textList(candidate.dependencyIds, `${id}.dependencyIds`),
    conflictKeys: textList(candidate.conflictKeys, `${id}.conflictKeys`),
    blockers: textList(candidate.blockers, `${id}.blockers`),
    confoundersToTrack: textList(candidate.confoundersToTrack, `${id}.confoundersToTrack`),
    attributionPlan: {
      targetClass: candidate.attributionPlan.targetClass,
      evidenceRefs: refs(candidate.attributionPlan.evidenceRefs, `${id}.attributionPlan.evidenceRefs`)
    },
    rollbackPlan: requiredText(candidate.rollbackPlan, `${id}.rollbackPlan`),
    safeNextStep: requiredText(candidate.safeNextStep, `${id}.safeNextStep`)
  };
  return normalized;
}

function verificationReasons(candidate: ExperimentCandidateV1): string[] {
  const reasons: string[] = [];
  if (candidate.truthState !== "KNOWN") reasons.push(`Candidate truth state is ${candidate.truthState}, not KNOWN`);
  if (candidate.evidenceRefs.length === 0) reasons.push("Candidate evidence is missing");
  if (candidate.sourceRefs.length === 0) reasons.push("Candidate source provenance is missing");
  if (candidate.priorityEvidenceRefs.length === 0) reasons.push("Caller-supplied priority has no evidence");
  if (candidate.preRegistration.evidenceRefs.length === 0) reasons.push("Pre-registration has no evidence");
  if (candidate.design.evidenceRefs.length === 0) reasons.push("Experiment design has no evidence");
  if (candidate.criteria.success.evidenceRefs.length === 0) reasons.push("Success criterion has no evidence");
  if (candidate.criteria.stop.evidenceRefs.length === 0) reasons.push("Stop criterion has no evidence");
  if (candidate.criteria.scale.evidenceRefs.length === 0) reasons.push("Scale criterion has no evidence");
  if (candidate.attributionPlan.evidenceRefs.length === 0) reasons.push("Attribution plan has no evidence");
  if (candidate.design.type === "RANDOMIZED_HOLDOUT" && !candidate.design.controlDefinition) reasons.push("Randomized holdout has no control definition");
  if (candidate.attributionPlan.targetClass === "RANDOMIZED" && candidate.design.type !== "RANDOMIZED_HOLDOUT") {
    reasons.push("Randomized attribution target is unsupported by the declared design");
  }
  if (candidate.attributionPlan.targetClass === "QUASI_EXPERIMENTAL" && candidate.design.type === "OBSERVATIONAL") {
    reasons.push("Quasi-experimental attribution target is unsupported by an observational-only design");
  }
  return reasons.sort((a, b) => a.localeCompare(b));
}

type CapacityUsage = Omit<ExperimentPortfolioCapacityV1, "maxConcurrent">;

function addUsage(usage: CapacityUsage, candidate: ExperimentCandidateV1): CapacityUsage {
  return {
    keeganHours: usage.keeganHours + candidate.resources.keeganHours,
    ioanaHours: usage.ioanaHours + candidate.resources.ioanaHours,
    jeevesHours: usage.jeevesHours + candidate.resources.jeevesHours,
    cashCents: usage.cashCents + candidate.resources.cashCents,
    exposureCount: usage.exposureCount + candidate.resources.exposureCount
  };
}

function withinCapacity(usage: CapacityUsage, count: number, capacity: ExperimentPortfolioCapacityV1): boolean {
  return (
    count <= capacity.maxConcurrent &&
    usage.keeganHours <= capacity.keeganHours &&
    usage.ioanaHours <= capacity.ioanaHours &&
    usage.jeevesHours <= capacity.jeevesHours &&
    usage.cashCents <= capacity.cashCents &&
    usage.exposureCount <= capacity.exposureCount
  );
}

function hasConflict(candidates: readonly ExperimentCandidateV1[]): boolean {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const key of candidate.conflictKeys) {
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}

function dependencyReady(candidate: ExperimentCandidateV1, selectedIds: Set<string>, satisfiedDependencyIds: Set<string>): boolean {
  return candidate.dependencyIds.every((id) => selectedIds.has(id) || satisfiedDependencyIds.has(id));
}

function portfolioFingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
}

export function buildExperimentPortfolioV1(input: {
  candidates: readonly ExperimentCandidateV1[];
  capacity: ExperimentPortfolioCapacityV1;
  generatedAt: string;
  satisfiedDependencyIds?: readonly string[];
}): ExperimentPortfolioV1 {
  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  if (!Array.isArray(input.candidates) || input.candidates.length > MAX_CANDIDATES) {
    throw new ExperimentPortfolioError("CANDIDATE_BOUND", `At most ${MAX_CANDIDATES} experiments may be optimized exactly`);
  }
  const capacity: ExperimentPortfolioCapacityV1 = {
    maxConcurrent: numberInRange(input.capacity.maxConcurrent, "capacity.maxConcurrent", 0, MAX_CANDIDATES, true),
    keeganHours: numberInRange(input.capacity.keeganHours, "capacity.keeganHours", 0, 10_000),
    ioanaHours: numberInRange(input.capacity.ioanaHours, "capacity.ioanaHours", 0, 10_000),
    jeevesHours: numberInRange(input.capacity.jeevesHours, "capacity.jeevesHours", 0, 100_000),
    cashCents: numberInRange(input.capacity.cashCents, "capacity.cashCents", 0, 100_000_000_000, true),
    exposureCount: numberInRange(input.capacity.exposureCount, "capacity.exposureCount", 0, 100_000_000, true)
  };
  const candidates = input.candidates.map((candidate) => normalizeCandidate(structuredClone(candidate), generatedAtMs));
  const ids = candidates.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length) throw new ExperimentPortfolioError("DUPLICATE_CANDIDATE", "Experiment ids must be unique");

  const verificationById = new Map(candidates.map((candidate) => [candidate.id, verificationReasons(candidate)]));
  const blocked = new Set(candidates.filter((candidate) => candidate.blockers.length > 0).map((candidate) => candidate.id));
  const eligible = candidates.filter((candidate) => verificationById.get(candidate.id)!.length === 0 && !blocked.has(candidate.id));
  const satisfiedDependencyIds = new Set(input.satisfiedDependencyIds ?? []);

  let bestIds: string[] = [];
  let bestPriority = -1;
  let evaluated = 0;
  const totalSubsets = 1 << eligible.length;
  for (let mask = 0; mask < totalSubsets; mask += 1) {
    const chosen = eligible.filter((_, index) => Boolean(mask & (1 << index)));
    const chosenIds = new Set(chosen.map((candidate) => candidate.id));
    if (hasConflict(chosen)) continue;
    if (chosen.some((candidate) => !dependencyReady(candidate, chosenIds, satisfiedDependencyIds))) continue;
    const usage = chosen.reduce<CapacityUsage>(addUsage, { keeganHours: 0, ioanaHours: 0, jeevesHours: 0, cashCents: 0, exposureCount: 0 });
    if (!withinCapacity(usage, chosen.length, capacity)) continue;
    evaluated += 1;
    const priority = chosen.reduce((sum, candidate) => sum + candidate.priorityPoints, 0);
    const sortedIds = chosen.map((candidate) => candidate.id).sort((a, b) => a.localeCompare(b));
    const betterTie = priority === bestPriority && (sortedIds.length < bestIds.length || (sortedIds.length === bestIds.length && sortedIds.join("\u0000") < bestIds.join("\u0000"))));
    if (priority > bestPriority || betterTie) {
      bestPriority = priority;
      bestIds = sortedIds;
    }
  }

  const selected = new Set(bestIds);
  const selectedCandidates = candidates.filter((candidate) => selected.has(candidate.id));
  const usedCapacity = selectedCandidates.reduce<CapacityUsage>(addUsage, { keeganHours: 0, ioanaHours: 0, jeevesHours: 0, cashCents: 0, exposureCount: 0 });
  const rankable = [...candidates].sort((a, b) => b.priorityPoints - a.priorityPoints || a.id.localeCompare(b.id));
  const rankById = new Map(rankable.map((candidate, index) => [candidate.id, index + 1]));
  const items = candidates
    .map((candidate): ExperimentPortfolioItemV1 => {
      const verification = verificationById.get(candidate.id)!;
      if (verification.length > 0) {
        return { candidate, disposition: "VERIFY", rank: rankById.get(candidate.id)!, exclusionReason: "Evidence or design requires verification", verificationReasons: verification };
      }
      if (candidate.blockers.length > 0) {
        return { candidate, disposition: "BLOCKED", rank: rankById.get(candidate.id)!, exclusionReason: candidate.blockers.join("; "), verificationReasons: [] };
      }
      if (selected.has(candidate.id)) {
        return { candidate, disposition: "SELECTED", rank: rankById.get(candidate.id)!, exclusionReason: null, verificationReasons: [] };
      }
      return { candidate, disposition: "DEFERRED_CAPACITY", rank: rankById.get(candidate.id)!, exclusionReason: "Excluded by the highest caller-priority capacity-feasible portfolio", verificationReasons: [] };
    })
    .sort((a, b) => a.rank - b.rank || a.candidate.id.localeCompare(b.candidate.id));

  const evidenceRefs = [...new Set(candidates.flatMap((candidate) => [
    ...candidate.evidenceRefs,
    ...candidate.design.evidenceRefs,
    ...candidate.preRegistration.evidenceRefs,
    ...candidate.criteria.success.evidenceRefs,
    ...candidate.criteria.stop.evidenceRefs,
    ...candidate.criteria.scale.evidenceRefs,
    ...candidate.priorityEvidenceRefs,
    ...candidate.attributionPlan.evidenceRefs
  ]))].sort((a, b) => a.localeCompare(b));
  const sourceRefs = [...new Set(candidates.flatMap((candidate) => candidate.sourceRefs))].sort((a, b) => a.localeCompare(b));
  const portfolioId = `experiment-portfolio:${portfolioFingerprint({ generatedAt, selectedIds: bestIds, evidenceRefs, sourceRefs })}`;

  return {
    contractVersion: "ExperimentPortfolioV1",
    policyVersion: EXPERIMENT_PORTFOLIO_POLICY_VERSION_V1,
    generatedAt,
    portfolioId,
    items,
    selectedIds: bestIds,
    usedCapacity,
    remainingCapacity: {
      keeganHours: capacity.keeganHours - usedCapacity.keeganHours,
      ioanaHours: capacity.ioanaHours - usedCapacity.ioanaHours,
      jeevesHours: capacity.jeevesHours - usedCapacity.jeevesHours,
      cashCents: capacity.cashCents - usedCapacity.cashCents,
      exposureCount: capacity.exposureCount - usedCapacity.exposureCount
    },
    evidenceRefs,
    sourceRefs,
    audit: {
      candidatesConsidered: candidates.length,
      feasiblePortfoliosEvaluated: evaluated,
      priorityMeaning: "CALLER_SUPPLIED_DECISION_PRIORITY_NOT_CONFIDENCE_OR_MONETARY_VALUE"
    },
    authority: {
      launch: false,
      spend: false,
      pricing: false,
      send: false,
      publish: false,
      externalAction: false,
      policyPromotion: false,
      approvalBypass: false
    }
  };
}

function criterionMet(criterion: ExperimentCriterionV1, value: number): boolean {
  return criterion.operator === "GTE" ? value >= criterion.threshold : value <= criterion.threshold;
}

export function evaluateExperimentOutcomeV1(input: {
  experiment: ExperimentCandidateV1;
  observation: ExperimentObservationV1;
  generatedAt: string;
}): ExperimentOutcomeDecisionV1 {
  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  const experiment = normalizeCandidate(structuredClone(input.experiment), generatedAtMs);
  const observation = structuredClone(input.observation);
  if (requiredText(observation.experimentId, "observation.experimentId") !== experiment.id) {
    throw new ExperimentPortfolioError("EXPERIMENT_MISMATCH", "Observation does not belong to the experiment");
  }
  const observedAt = canonicalTimestamp(observation.observedAt, "observation.observedAt");
  if (Date.parse(observedAt) > generatedAtMs) throw new ExperimentPortfolioError("FUTURE_OBSERVATION", "Observation is future-dated");
  if (!new Set<ExperimentTruthStateV1>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "PARTIAL", "CONFLICTED"]).has(observation.truthState)) {
    throw new ExperimentPortfolioError("INVALID_TRUTH_STATE", "Observation truth state is invalid");
  }
  if (!new Set<ExperimentAttributionClassV1>(["RANDOMIZED", "QUASI_EXPERIMENTAL", "CORRELATIONAL", "UNKNOWN"]).has(observation.attributionClass)) {
    throw new ExperimentPortfolioError("INVALID_ATTRIBUTION", "Observation attribution class is invalid");
  }
  const evidenceRefs = refs(observation.evidenceRefs, "observation.evidenceRefs");
  const attributionEvidenceRefs = refs(observation.attributionEvidenceRefs, "observation.attributionEvidenceRefs");
  const confounders = textList(observation.confounders, "observation.confounders");
  const sampleSize = numberInRange(observation.sampleSize, "observation.sampleSize", 0, 100_000_000, true);
  const reasons: string[] = [];
  if (observation.truthState !== "KNOWN") reasons.push(`Observation truth state is ${observation.truthState}, not KNOWN`);
  if (evidenceRefs.length === 0) reasons.push("Observation evidence is missing");
  if (requiredText(observation.metric.id, "observation.metric.id") !== experiment.primaryMetric.id) reasons.push("Observed metric id does not match the pre-registered primary metric");
  if (requiredText(observation.metric.unit, "observation.metric.unit") !== experiment.primaryMetric.unit) reasons.push("Observed metric unit does not match the pre-registered primary metric");
  if (observation.metric.value != null && (!Number.isFinite(observation.metric.value) || Math.abs(observation.metric.value) > 1e15)) reasons.push("Observed metric value is invalid");
  if (observation.attributionClass !== "UNKNOWN" && attributionEvidenceRefs.length === 0) reasons.push("Attribution classification has no evidence");
  if (observation.attributionClass === "RANDOMIZED" && experiment.design.type !== "RANDOMIZED_HOLDOUT") reasons.push("Randomized attribution is unsupported by the pre-registered design");
  if (observation.attributionClass === "QUASI_EXPERIMENTAL" && experiment.design.type === "OBSERVATIONAL") reasons.push("Quasi-experimental attribution is unsupported by the pre-registered design");
  if (Date.parse(observedAt) < Date.parse(experiment.evaluationWindow.start)) reasons.push("Observation predates the experiment evaluation window");
  if (reasons.length > 0) {
    return { experimentId: experiment.id, decision: "VERIFY", reasons: reasons.sort(), successCriterionMet: null, stopCriterionMet: null, scaleCriterionMet: null, attributionClass: observation.attributionClass, causalReviewState: "NOT_ESTABLISHED", confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  if (observation.metric.value == null) {
    return { experimentId: experiment.id, decision: "INCONCLUSIVE", reasons: ["Primary metric remains unknown"], successCriterionMet: null, stopCriterionMet: null, scaleCriterionMet: null, attributionClass: observation.attributionClass, causalReviewState: "NOT_ESTABLISHED", confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }

  const value = observation.metric.value;
  const successCriterionMet = criterionMet(experiment.criteria.success, value);
  const stopCriterionMet = criterionMet(experiment.criteria.stop, value);
  const scaleCriterionMet = criterionMet(experiment.criteria.scale, value);
  const earliestDecisionMs = Date.parse(experiment.evaluationWindow.earliestDecisionAt);
  const endMs = Date.parse(experiment.evaluationWindow.end);
  const observedAtMs = Date.parse(observedAt);
  const enoughSample = sampleSize >= experiment.minimumSampleSize;
  const causalReviewState =
    observation.attributionClass === "RANDOMIZED" &&
    experiment.design.type === "RANDOMIZED_HOLDOUT" &&
    attributionEvidenceRefs.length > 0 &&
    confounders.length === 0 &&
    observation.completionState === "FINAL" &&
    observedAtMs >= endMs &&
    enoughSample
      ? "REVIEW_ELIGIBLE"
      : "NOT_ESTABLISHED";

  if (observedAtMs < earliestDecisionMs || !enoughSample) {
    return { experimentId: experiment.id, decision: "CONTINUE", reasons: [observedAtMs < earliestDecisionMs ? "Pre-registered earliest decision time has not arrived" : "Minimum sample size has not been reached"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  if (stopCriterionMet) {
    return { experimentId: experiment.id, decision: "STOP_REVIEW", reasons: ["Pre-registered stop criterion is met"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  if (observation.completionState !== "FINAL" || observedAtMs < endMs) {
    return { experimentId: experiment.id, decision: "CONTINUE", reasons: ["Final evaluation window is not complete"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  if (successCriterionMet && scaleCriterionMet) {
    return { experimentId: experiment.id, decision: "SCALE_REVIEW", reasons: ["Pre-registered success and scale criteria are met; scaling still requires governed review"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  if (successCriterionMet) {
    return { experimentId: experiment.id, decision: "HOLD_REVIEW", reasons: ["Success criterion is met but scale criterion is not"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
  }
  return { experimentId: experiment.id, decision: "INCONCLUSIVE", reasons: ["Final observation did not meet pre-registered success, stop, or scale review conditions"], successCriterionMet, stopCriterionMet, scaleCriterionMet, attributionClass: observation.attributionClass, causalReviewState, confounders, policyUpdateAuthorized: false, externalActionAuthorized: false };
}

export function compileShadowPolicyReviewV1(input: {
  policyCandidateId: string;
  statement: string;
  policyEvidenceRefs: readonly string[];
  supportingOutcomes: readonly ShadowPolicyOutcomeEvidenceV1[];
  minimumIndependentOutcomes: number;
  shadowEvaluationPlan: string;
  rollbackPlan: string;
  generatedAt: string;
}): ShadowPolicyReviewV1 {
  const generatedAt = canonicalTimestamp(input.generatedAt, "generatedAt");
  const generatedAtMs = Date.parse(generatedAt);
  requiredText(input.policyCandidateId, "policyCandidateId");
  requiredText(input.statement, "statement");
  const policyEvidenceRefs = refs(input.policyEvidenceRefs, "policyEvidenceRefs");
  const minimumIndependentOutcomes = numberInRange(input.minimumIndependentOutcomes, "minimumIndependentOutcomes", 2, 100, true);
  const shadowEvaluationPlan = requiredText(input.shadowEvaluationPlan, "shadowEvaluationPlan");
  const rollbackPlan = requiredText(input.rollbackPlan, "rollbackPlan");
  const reasons: string[] = [];
  if (policyEvidenceRefs.length === 0) reasons.push("Policy candidate has no evidence");
  if (!Array.isArray(input.supportingOutcomes) || input.supportingOutcomes.length > 100) {
    throw new ExperimentPortfolioError("OUTCOME_BOUND", "supportingOutcomes is invalid");
  }

  const seenOutcomeRefs = new Set<string>();
  const validOutcomes: ShadowPolicyOutcomeEvidenceV1[] = [];
  for (const raw of input.supportingOutcomes) {
    const outcome = structuredClone(raw);
    const experimentId = requiredText(outcome.experimentId, "supportingOutcome.experimentId");
    const outcomeRef = requiredText(outcome.outcomeRef, "supportingOutcome.outcomeRef");
    if (seenOutcomeRefs.has(outcomeRef)) {
      reasons.push(`Duplicate outcome reference: ${outcomeRef}`);
      continue;
    }
    seenOutcomeRefs.add(outcomeRef);
    const observedAt = canonicalTimestamp(outcome.observedAt, `${experimentId}.observedAt`);
    if (Date.parse(observedAt) > generatedAtMs) {
      reasons.push(`Future outcome evidence: ${outcomeRef}`);
      continue;
    }
    if (outcome.truthState !== "KNOWN") {
      reasons.push(`Outcome ${outcomeRef} truth state is ${outcome.truthState}, not KNOWN`);
      continue;
    }
    if (refs(outcome.evidenceRefs, `${experimentId}.evidenceRefs`).length === 0) {
      reasons.push(`Outcome ${outcomeRef} has no evidence`);
      continue;
    }
    if (outcome.attributionClass === "UNKNOWN") {
      reasons.push(`Outcome ${outcomeRef} has UNKNOWN attribution`);
      continue;
    }
    validOutcomes.push({ ...outcome, experimentId, outcomeRef, observedAt });
  }

  const independentExperimentIds = [...new Set(validOutcomes.map((outcome) => outcome.experimentId))].sort((a, b) => a.localeCompare(b));
  const supportingOutcomeRefs = validOutcomes.map((outcome) => outcome.outcomeRef).sort((a, b) => a.localeCompare(b));
  if (reasons.length > 0) {
    return { policyCandidateId: input.policyCandidateId, state: "VERIFY", reasons: reasons.sort(), independentExperimentIds, supportingOutcomeRefs, shadowEvaluationPlan, rollbackPlan, reviewRequired: true, shadowOnly: true, promotionAuthorized: false, externalActionAuthorized: false };
  }
  if (independentExperimentIds.length < minimumIndependentOutcomes) {
    return { policyCandidateId: input.policyCandidateId, state: "INSUFFICIENT_EVIDENCE", reasons: [`At least ${minimumIndependentOutcomes} independent experiment outcomes are required; ${independentExperimentIds.length} are present`], independentExperimentIds, supportingOutcomeRefs, shadowEvaluationPlan, rollbackPlan, reviewRequired: true, shadowOnly: true, promotionAuthorized: false, externalActionAuthorized: false };
  }
  return { policyCandidateId: input.policyCandidateId, state: "SHADOW_REVIEW_READY", reasons: ["Minimum independent evidence threshold is met; only shadow review is authorized"], independentExperimentIds, supportingOutcomeRefs, shadowEvaluationPlan, rollbackPlan, reviewRequired: true, shadowOnly: true, promotionAuthorized: false, externalActionAuthorized: false };
}

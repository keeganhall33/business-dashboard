import { createHash } from "node:crypto";

export const DECISION_PORTFOLIO_POLICY_VERSION_V1 = "decision_portfolio_policy_v1.0.0" as const;

export type DecisionOwnerV1 = "KEEGAN" | "IOANA" | "JEEVES";
export type DecisionEvidenceStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type DecisionApprovalClassV1 = "NONE" | "REVIEW" | "KEEGAN";
export type DecisionDispositionV1 = "SELECTED" | "DEFERRED" | "REJECTED" | "INFORMATION_GAIN";

export type SupportedMonetaryCaseV1 = {
  currency: "USD";
  downsideCents: number;
  baseCents: number;
  upsideCents: number;
  probabilityLow: number;
  probabilityBase: number;
  probabilityHigh: number;
  calibrationClass: "OBSERVED" | "REFERENCE_CLASS" | "EXPERT_ESTIMATE";
};

export type DecisionCandidateV1 = {
  id: string;
  title: string;
  candidateType: "OPPORTUNITY" | "CAMPAIGN" | "EXPERIMENT" | "RELATIONSHIP" | "DECISION";
  owner: DecisionOwnerV1;
  approvalClass: DecisionApprovalClassV1;
  evidenceState: DecisionEvidenceStateV1;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  monetaryCase: SupportedMonetaryCaseV1 | null;
  value: {
    strategicFit: number;
    compoundingAdvantage: number;
    relationshipAccess: number;
    futureOptions: number;
    learningValue: number;
    urgency: number;
    reversibility: number;
  };
  risk: { execution: number; reputation: number; rights: number };
  resources: { keeganHours: number; ioanaHours: number; jeevesHours: number; cashCents: number };
  dependencyIds: readonly string[];
  conflictKeys: readonly string[];
  blockers: readonly string[];
  informationGainAction: string | null;
  safeNextStep: string;
  successMetric: string;
  evaluationWindow: { start: string; end: string };
};

export type DecisionPortfolioCapacityV1 = {
  keeganHours: number;
  ioanaHours: number;
  jeevesHours: number;
  cashCents: number;
  maxSelected: number;
  maxKeeganDecisions: number;
};

export type DecisionScoreV1 = {
  monetaryExpectedCents: number | null;
  monetaryScore: number;
  strategicScore: number;
  riskPenalty: number;
  totalScore: number;
  components: Readonly<Record<string, number>>;
};

export type DecisionPortfolioItemV1 = {
  candidate: DecisionCandidateV1;
  disposition: DecisionDispositionV1;
  score: DecisionScoreV1;
  rank: number;
  rationale: string;
  exclusionReason: string | null;
  displacedBy: readonly string[];
};

export type DecisionPortfolioV1 = {
  contractVersion: "DecisionPortfolioV1";
  policyVersion: typeof DECISION_PORTFOLIO_POLICY_VERSION_V1;
  generatedAt: string;
  portfolioId: string;
  items: readonly DecisionPortfolioItemV1[];
  selectedIds: readonly string[];
  ownerQueues: Readonly<Record<DecisionOwnerV1, readonly string[]>>;
  keeganDecisionIds: readonly string[];
  informationGainIds: readonly string[];
  usedCapacity: Omit<DecisionPortfolioCapacityV1, "maxSelected" | "maxKeeganDecisions">;
  remainingCapacity: Omit<DecisionPortfolioCapacityV1, "maxSelected" | "maxKeeganDecisions">;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  audit: {
    candidatesConsidered: number;
    feasiblePortfoliosEvaluated: number;
    duplicateCandidatesSuppressed: number;
    exactOptimization: true;
  };
};

export class DecisionPortfolioError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DecisionPortfolioError";
  }
}

const MAX_CANDIDATES = 18;
const MAX_REFS = 100;
const SCORE_WEIGHTS = Object.freeze({
  monetary: 0.2,
  strategicFit: 0.2,
  compoundingAdvantage: 0.16,
  relationshipAccess: 0.1,
  futureOptions: 0.12,
  learningValue: 0.08,
  urgency: 0.08,
  reversibility: 0.06,
  executionRisk: 0.08,
  reputationRisk: 0.14,
  rightsRisk: 0.1
});

function finite(value: unknown, label: string, minimum: number, maximum: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new DecisionPortfolioError("INVALID_NUMBER", `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new DecisionPortfolioError("REQUIRED_TEXT", `${label} is required`);
  return value.trim();
}

function list(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_REFS) throw new DecisionPortfolioError("INVALID_LIST", `${label} is invalid`);
  return [...new Set(values.map((value) => text(value, label)))].sort((a, b) => a.localeCompare(b));
}

function date(value: string, label: string): string {
  const normalized = text(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new DecisionPortfolioError("INVALID_DATE", `${label} must be an ISO-compatible date`);
  return normalized;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeMoney(value: SupportedMonetaryCaseV1 | null, candidateId: string): SupportedMonetaryCaseV1 | null {
  if (value == null) return null;
  const downsideCents = finite(value.downsideCents, `${candidateId}.downsideCents`, -100_000_000_000, 100_000_000_000, true);
  const baseCents = finite(value.baseCents, `${candidateId}.baseCents`, -100_000_000_000, 100_000_000_000, true);
  const upsideCents = finite(value.upsideCents, `${candidateId}.upsideCents`, -100_000_000_000, 100_000_000_000, true);
  if (!(downsideCents <= baseCents && baseCents <= upsideCents)) throw new DecisionPortfolioError("INVALID_RANGE", `${candidateId} monetary range is unordered`);
  const probabilityLow = finite(value.probabilityLow, `${candidateId}.probabilityLow`, 0, 1);
  const probabilityBase = finite(value.probabilityBase, `${candidateId}.probabilityBase`, 0, 1);
  const probabilityHigh = finite(value.probabilityHigh, `${candidateId}.probabilityHigh`, 0, 1);
  if (!(probabilityLow <= probabilityBase && probabilityBase <= probabilityHigh)) throw new DecisionPortfolioError("INVALID_RANGE", `${candidateId} probability range is unordered`);
  if (!new Set(["OBSERVED", "REFERENCE_CLASS", "EXPERT_ESTIMATE"]).has(value.calibrationClass)) {
    throw new DecisionPortfolioError("UNCALIBRATED_PROBABILITY", `${candidateId} probability requires a calibration class`);
  }
  return { currency: "USD", downsideCents, baseCents, upsideCents, probabilityLow, probabilityBase, probabilityHigh, calibrationClass: value.calibrationClass };
}

function normalizeCandidate(candidate: DecisionCandidateV1): DecisionCandidateV1 {
  const id = text(candidate.id, "candidate.id");
  if (!new Set(["OPPORTUNITY", "CAMPAIGN", "EXPERIMENT", "RELATIONSHIP", "DECISION"]).has(candidate.candidateType)) throw new DecisionPortfolioError("INVALID_TYPE", `${id} has an invalid type`);
  if (!new Set(["KEEGAN", "IOANA", "JEEVES"]).has(candidate.owner)) throw new DecisionPortfolioError("INVALID_OWNER", `${id} has an invalid owner`);
  if (!new Set(["NONE", "REVIEW", "KEEGAN"]).has(candidate.approvalClass)) throw new DecisionPortfolioError("INVALID_APPROVAL", `${id} has an invalid approval class`);
  if (!new Set(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]).has(candidate.evidenceState)) throw new DecisionPortfolioError("INVALID_EVIDENCE_STATE", `${id} has an invalid evidence state`);
  const scale = (value: number, label: string) => finite(value, `${id}.${label}`, 0, 100);
  const resources = {
    keeganHours: finite(candidate.resources.keeganHours, `${id}.keeganHours`, 0, 10_000),
    ioanaHours: finite(candidate.resources.ioanaHours, `${id}.ioanaHours`, 0, 10_000),
    jeevesHours: finite(candidate.resources.jeevesHours, `${id}.jeevesHours`, 0, 100_000),
    cashCents: finite(candidate.resources.cashCents, `${id}.cashCents`, 0, 100_000_000_000, true)
  };
  if (candidate.approvalClass === "KEEGAN" && resources.keeganHours === 0) resources.keeganHours = 0.25;
  const evaluationWindow = { start: date(candidate.evaluationWindow.start, `${id}.evaluationWindow.start`), end: date(candidate.evaluationWindow.end, `${id}.evaluationWindow.end`) };
  if (Date.parse(evaluationWindow.end) < Date.parse(evaluationWindow.start)) throw new DecisionPortfolioError("INVALID_RANGE", `${id} evaluation window is unordered`);
  return {
    ...structuredClone(candidate), id, title: text(candidate.title, `${id}.title`), resources,
    evidenceRefs: list(candidate.evidenceRefs, `${id}.evidenceRefs`), sourceRefs: list(candidate.sourceRefs, `${id}.sourceRefs`),
    dependencyIds: list(candidate.dependencyIds, `${id}.dependencyIds`), conflictKeys: list(candidate.conflictKeys, `${id}.conflictKeys`), blockers: list(candidate.blockers, `${id}.blockers`),
    informationGainAction: candidate.informationGainAction == null ? null : text(candidate.informationGainAction, `${id}.informationGainAction`),
    safeNextStep: text(candidate.safeNextStep, `${id}.safeNextStep`), successMetric: text(candidate.successMetric, `${id}.successMetric`), evaluationWindow,
    monetaryCase: normalizeMoney(candidate.monetaryCase, id),
    value: {
      strategicFit: scale(candidate.value.strategicFit, "strategicFit"), compoundingAdvantage: scale(candidate.value.compoundingAdvantage, "compoundingAdvantage"),
      relationshipAccess: scale(candidate.value.relationshipAccess, "relationshipAccess"), futureOptions: scale(candidate.value.futureOptions, "futureOptions"),
      learningValue: scale(candidate.value.learningValue, "learningValue"), urgency: scale(candidate.value.urgency, "urgency"), reversibility: scale(candidate.value.reversibility, "reversibility")
    },
    risk: { execution: scale(candidate.risk.execution, "executionRisk"), reputation: scale(candidate.risk.reputation, "reputationRisk"), rights: scale(candidate.risk.rights, "rightsRisk") }
  };
}

export function scoreDecisionCandidateV1(candidate: DecisionCandidateV1): DecisionScoreV1 {
  const monetaryExpectedCents = candidate.monetaryCase == null ? null : Math.round(
    candidate.monetaryCase.downsideCents * candidate.monetaryCase.probabilityLow * 0.25 +
    candidate.monetaryCase.baseCents * candidate.monetaryCase.probabilityBase * 0.5 +
    candidate.monetaryCase.upsideCents * candidate.monetaryCase.probabilityHigh * 0.25 - candidate.resources.cashCents
  );
  const monetaryScore = monetaryExpectedCents == null ? 0 : Math.max(-100, Math.min(100, Math.sign(monetaryExpectedCents) * Math.log10(1 + Math.abs(monetaryExpectedCents) / 100) * 20));
  const components = {
    monetary: monetaryScore * SCORE_WEIGHTS.monetary,
    strategicFit: candidate.value.strategicFit * SCORE_WEIGHTS.strategicFit,
    compoundingAdvantage: candidate.value.compoundingAdvantage * SCORE_WEIGHTS.compoundingAdvantage,
    relationshipAccess: candidate.value.relationshipAccess * SCORE_WEIGHTS.relationshipAccess,
    futureOptions: candidate.value.futureOptions * SCORE_WEIGHTS.futureOptions,
    learningValue: candidate.value.learningValue * SCORE_WEIGHTS.learningValue,
    urgency: candidate.value.urgency * SCORE_WEIGHTS.urgency,
    reversibility: candidate.value.reversibility * SCORE_WEIGHTS.reversibility,
    executionRisk: -candidate.risk.execution * SCORE_WEIGHTS.executionRisk,
    reputationRisk: -candidate.risk.reputation * SCORE_WEIGHTS.reputationRisk,
    rightsRisk: -candidate.risk.rights * SCORE_WEIGHTS.rightsRisk
  };
  const strategicScore = components.strategicFit + components.compoundingAdvantage + components.relationshipAccess + components.futureOptions + components.learningValue + components.urgency + components.reversibility;
  const riskPenalty = -(components.executionRisk + components.reputationRisk + components.rightsRisk);
  const totalScore = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { monetaryExpectedCents, monetaryScore, strategicScore, riskPenalty, totalScore, components };
}

type Usage = { keeganHours: number; ioanaHours: number; jeevesHours: number; cashCents: number; keeganDecisions: number };

function addUsage(usage: Usage, candidate: DecisionCandidateV1): Usage {
  return {
    keeganHours: usage.keeganHours + candidate.resources.keeganHours,
    ioanaHours: usage.ioanaHours + candidate.resources.ioanaHours,
    jeevesHours: usage.jeevesHours + candidate.resources.jeevesHours,
    cashCents: usage.cashCents + candidate.resources.cashCents,
    keeganDecisions: usage.keeganDecisions + (candidate.approvalClass === "KEEGAN" ? 1 : 0)
  };
}

function within(usage: Usage, capacity: DecisionPortfolioCapacityV1): boolean {
  return usage.keeganHours <= capacity.keeganHours && usage.ioanaHours <= capacity.ioanaHours && usage.jeevesHours <= capacity.jeevesHours && usage.cashCents <= capacity.cashCents && usage.keeganDecisions <= capacity.maxKeeganDecisions;
}

function isBetter(score: number, ids: readonly string[], bestScore: number, bestIds: readonly string[]): boolean {
  if (score !== bestScore) return score > bestScore;
  if (ids.length !== bestIds.length) return ids.length < bestIds.length;
  return ids.join("\u0000") < bestIds.join("\u0000");
}

export function buildDecisionPortfolioV1(input: {
  candidates: readonly DecisionCandidateV1[];
  capacity: DecisionPortfolioCapacityV1;
  generatedAt: string;
  satisfiedDependencyIds?: readonly string[];
}): DecisionPortfolioV1 {
  if (!Array.isArray(input.candidates) || input.candidates.length > MAX_CANDIDATES) throw new DecisionPortfolioError("CANDIDATE_BOUND", `At most ${MAX_CANDIDATES} candidates may be optimized exactly`);
  const capacity = {
    keeganHours: finite(input.capacity.keeganHours, "capacity.keeganHours", 0, 10_000), ioanaHours: finite(input.capacity.ioanaHours, "capacity.ioanaHours", 0, 10_000),
    jeevesHours: finite(input.capacity.jeevesHours, "capacity.jeevesHours", 0, 100_000), cashCents: finite(input.capacity.cashCents, "capacity.cashCents", 0, 100_000_000_000, true),
    maxSelected: finite(input.capacity.maxSelected, "capacity.maxSelected", 0, MAX_CANDIDATES, true), maxKeeganDecisions: finite(input.capacity.maxKeeganDecisions, "capacity.maxKeeganDecisions", 0, MAX_CANDIDATES, true)
  };
  const generatedAt = date(input.generatedAt, "generatedAt");
  const satisfied = new Set(list(input.satisfiedDependencyIds ?? [], "satisfiedDependencyIds"));
  const normalized = input.candidates.map(normalizeCandidate);
  const byId = new Map<string, DecisionCandidateV1>();
  let duplicateCandidatesSuppressed = 0;
  for (const candidate of normalized.sort((a, b) => a.id.localeCompare(b.id))) {
    if (byId.has(candidate.id)) { duplicateCandidatesSuppressed += 1; continue; }
    byId.set(candidate.id, candidate);
  }
  const candidates = [...byId.values()];
  const scores = new Map(candidates.map((candidate) => [candidate.id, scoreDecisionCandidateV1(candidate)]));
  const blocked = new Set(candidates.filter((candidate) => candidate.blockers.length > 0 || candidate.evidenceState === "UNKNOWN" || candidate.evidenceState === "STALE" || candidate.evidenceState === "CONFLICTED").map((candidate) => candidate.id));
  const eligible = candidates.filter((candidate) => !blocked.has(candidate.id));
  let feasiblePortfoliosEvaluated = 0;
  let bestScore = 0;
  let bestIds: string[] = [];
  let bestUsage: Usage = { keeganHours: 0, ioanaHours: 0, jeevesHours: 0, cashCents: 0, keeganDecisions: 0 };

  function visit(index: number, chosen: DecisionCandidateV1[], usage: Usage, conflicts: Set<string>): void {
    if (index === eligible.length) {
      const ids = chosen.map((candidate) => candidate.id).sort();
      const idSet = new Set(ids);
      if (chosen.some((candidate) => candidate.dependencyIds.some((id) => !satisfied.has(id) && !idSet.has(id)))) return;
      feasiblePortfoliosEvaluated += 1;
      const score = chosen.reduce((sum, candidate) => sum + scores.get(candidate.id)!.totalScore, 0);
      if (isBetter(score, ids, bestScore, bestIds)) { bestScore = score; bestIds = ids; bestUsage = usage; }
      return;
    }
    visit(index + 1, chosen, usage, conflicts);
    const candidate = eligible[index];
    if (chosen.length >= capacity.maxSelected || candidate.conflictKeys.some((key) => conflicts.has(key))) return;
    const nextUsage = addUsage(usage, candidate);
    if (!within(nextUsage, capacity)) return;
    visit(index + 1, [...chosen, candidate], nextUsage, new Set([...conflicts, ...candidate.conflictKeys]));
  }
  visit(0, [], bestUsage, new Set());

  const selected = new Set(bestIds);
  const selectedByScore = bestIds.map((id) => byId.get(id)!).sort((a, b) => scores.get(b.id)!.totalScore - scores.get(a.id)!.totalScore || a.id.localeCompare(b.id));
  const ranked = candidates.slice().sort((a, b) => scores.get(b.id)!.totalScore - scores.get(a.id)!.totalScore || a.id.localeCompare(b.id));
  const items = ranked.map((candidate, index): DecisionPortfolioItemV1 => {
    const score = scores.get(candidate.id)!;
    if (selected.has(candidate.id)) return { candidate, disposition: "SELECTED", score, rank: index + 1, rationale: `Selected by ${DECISION_PORTFOLIO_POLICY_VERSION_V1} within all declared capacity, dependency, conflict, evidence, and approval limits.`, exclusionReason: null, displacedBy: [] };
    if (blocked.has(candidate.id)) {
      const reason = candidate.blockers.length ? `Blocked: ${candidate.blockers.join("; ")}` : `Evidence state ${candidate.evidenceState} requires resolution before allocation.`;
      return { candidate, disposition: candidate.informationGainAction ? "INFORMATION_GAIN" : "REJECTED", score, rank: index + 1, rationale: candidate.informationGainAction ?? "No bounded information-gain action was supplied.", exclusionReason: reason, displacedBy: [] };
    }
    const competing = selectedByScore.filter((item) => item.owner === candidate.owner || item.conflictKeys.some((key) => candidate.conflictKeys.includes(key))).map((item) => item.id);
    return { candidate, disposition: "DEFERRED", score, rank: index + 1, rationale: "Eligible, but excluded from the highest-scoring feasible portfolio.", exclusionReason: "Capacity, conflict, dependency, or Keegan-decision limits made another portfolio stronger.", displacedBy: competing };
  });
  const usedCapacity = { keeganHours: bestUsage.keeganHours, ioanaHours: bestUsage.ioanaHours, jeevesHours: bestUsage.jeevesHours, cashCents: bestUsage.cashCents };
  const remainingCapacity = { keeganHours: capacity.keeganHours - usedCapacity.keeganHours, ioanaHours: capacity.ioanaHours - usedCapacity.ioanaHours, jeevesHours: capacity.jeevesHours - usedCapacity.jeevesHours, cashCents: capacity.cashCents - usedCapacity.cashCents };
  const identity = { policyVersion: DECISION_PORTFOLIO_POLICY_VERSION_V1, generatedAt, capacity, selectedIds: bestIds, candidates: candidates.map((candidate) => candidate.id) };
  return freeze({
    contractVersion: "DecisionPortfolioV1", policyVersion: DECISION_PORTFOLIO_POLICY_VERSION_V1, generatedAt,
    portfolioId: `decision_portfolio_${createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 20)}`,
    items, selectedIds: bestIds,
    ownerQueues: { KEEGAN: selectedByScore.filter((candidate) => candidate.owner === "KEEGAN").map((candidate) => candidate.id), IOANA: selectedByScore.filter((candidate) => candidate.owner === "IOANA").map((candidate) => candidate.id), JEEVES: selectedByScore.filter((candidate) => candidate.owner === "JEEVES").map((candidate) => candidate.id) },
    keeganDecisionIds: selectedByScore.filter((candidate) => candidate.approvalClass === "KEEGAN").map((candidate) => candidate.id),
    informationGainIds: items.filter((item) => item.disposition === "INFORMATION_GAIN").map((item) => item.candidate.id),
    usedCapacity, remainingCapacity,
    evidenceRefs: list(candidates.flatMap((candidate) => candidate.evidenceRefs), "portfolio.evidenceRefs"), sourceRefs: list(candidates.flatMap((candidate) => candidate.sourceRefs), "portfolio.sourceRefs"),
    audit: { candidatesConsidered: candidates.length, feasiblePortfoliosEvaluated, duplicateCandidatesSuppressed, exactOptimization: true }
  });
}

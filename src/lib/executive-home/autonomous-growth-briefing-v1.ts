import type { DecisionPortfolioChangeV1 } from "@/lib/strategy-engine/decision-portfolio-change-v1";
import type { DecisionPortfolioProjectionHistoryV1 } from "@/lib/strategy-engine/decision-portfolio-loader-v1";
import type {
  DecisionEvidenceStateV1,
  DecisionOwnerV1,
  DecisionPortfolioItemV1,
} from "@/lib/strategy-engine/decision-portfolio-v1";

export const AUTONOMOUS_GROWTH_BRIEFING_VERSION_V1 =
  "AUTONOMOUS_GROWTH_BRIEFING_V1" as const;

export type AutonomousGrowthBriefingStatusV1 = "LIVE" | "STALE" | "UNAVAILABLE";

export type AutonomousGrowthBriefingItemV1 = Readonly<{
  id: string;
  title: string;
  candidateType: DecisionPortfolioItemV1["candidate"]["candidateType"];
  owner: DecisionOwnerV1;
  approvalClass: DecisionPortfolioItemV1["candidate"]["approvalClass"];
  evidenceState: DecisionEvidenceStateV1;
  rank: number;
  rationale: string;
  nextStep: string;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  executionState: "SELECTED_NOT_EXECUTION_PROOF";
}>;

export type AutonomousGrowthBriefingChangeV1 = Readonly<{
  kind:
    | "SELECTED_ADDED"
    | "SELECTED_REMOVED"
    | "KEEGAN_DECISION_ADDED"
    | "KEEGAN_DECISION_CLEARED"
    | "PORTFOLIO_DETAIL_CHANGED";
  candidateId: string;
  summary: string;
  causeAttribution: "NOT_ESTABLISHED";
}>;

export type AutonomousGrowthOpportunityCostV1 = Readonly<{
  id: string;
  title: string;
  rank: number;
  disposition: "DEFERRED" | "REJECTED" | "INFORMATION_GAIN";
  exclusionReason: string | null;
  displacedBy: readonly string[];
  evidenceState: DecisionEvidenceStateV1;
}>;

export type AutonomousGrowthBriefingV1 = Readonly<{
  version: typeof AUTONOMOUS_GROWTH_BRIEFING_VERSION_V1;
  status: AutonomousGrowthBriefingStatusV1;
  decisionGrade: boolean;
  portfolioId: string | null;
  generatedAt: string | null;
  northStarTrajectory: Readonly<{
    state: "UNKNOWN";
    summary: string;
  }>;
  needsKeegan: readonly AutonomousGrowthBriefingItemV1[];
  selectedPortfolio: readonly AutonomousGrowthBriefingItemV1[];
  delegated: Readonly<{
    JEEVES: readonly AutonomousGrowthBriefingItemV1[];
    IOANA: readonly AutonomousGrowthBriefingItemV1[];
  }>;
  campaigns: readonly AutonomousGrowthBriefingItemV1[];
  experiments: readonly AutonomousGrowthBriefingItemV1[];
  informationGain: readonly AutonomousGrowthOpportunityCostV1[];
  opportunityCost: readonly AutonomousGrowthOpportunityCostV1[];
  materialChanges: readonly AutonomousGrowthBriefingChangeV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  issues: readonly string[];
  limitations: readonly string[];
  authority: Readonly<{
    portfolioMutationAllowed: false;
    allocationMutationAllowed: false;
    externalActionAllowed: false;
    approvalBypassAllowed: false;
    outcomeClaimAllowed: false;
    causalClaimAllowed: false;
  }>;
}>;

export type AutonomousGrowthBriefingInputV1 = Readonly<{
  history: DecisionPortfolioProjectionHistoryV1 | null;
  change?: DecisionPortfolioChangeV1 | null;
  maxSelected?: number;
  maxChanges?: number;
}>;

const AUTHORITY = Object.freeze({
  portfolioMutationAllowed: false,
  allocationMutationAllowed: false,
  externalActionAllowed: false,
  approvalBypassAllowed: false,
  outcomeClaimAllowed: false,
  causalClaimAllowed: false,
} as const);

const LIMITATIONS = Object.freeze([
  "Selection is a canonical allocation decision, not proof that work started, completed, or produced an outcome.",
  "Portfolio changes describe observed state differences only; they do not establish why a rank, selection, or decision changed.",
  "No monetary value, confidence, causal effect, outcome, relationship access, or execution state is invented by this briefing.",
] as const);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function boundedInteger(value: number | undefined, fallback: number, max: number): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`AUTONOMOUS_GROWTH_BRIEFING_INVALID_BOUND:${String(value)}`);
  }
  return value;
}

function toBriefingItem(item: DecisionPortfolioItemV1): AutonomousGrowthBriefingItemV1 {
  return {
    id: item.candidate.id,
    title: item.candidate.title,
    candidateType: item.candidate.candidateType,
    owner: item.candidate.owner,
    approvalClass: item.candidate.approvalClass,
    evidenceState: item.candidate.evidenceState,
    rank: item.rank,
    rationale: item.rationale,
    nextStep: item.candidate.safeNextStep,
    evidenceRefs: [...item.candidate.evidenceRefs],
    sourceRefs: [...item.candidate.sourceRefs],
    executionState: "SELECTED_NOT_EXECUTION_PROOF",
  };
}

function toOpportunityCost(item: DecisionPortfolioItemV1): AutonomousGrowthOpportunityCostV1 | null {
  if (item.disposition === "SELECTED") return null;
  return {
    id: item.candidate.id,
    title: item.candidate.title,
    rank: item.rank,
    disposition: item.disposition,
    exclusionReason: item.exclusionReason,
    displacedBy: [...item.displacedBy],
    evidenceState: item.candidate.evidenceState,
  };
}

function changeSummary(
  kind: AutonomousGrowthBriefingChangeV1["kind"],
  candidateId: string,
): string {
  if (kind === "SELECTED_ADDED") return `${candidateId} entered the selected portfolio.`;
  if (kind === "SELECTED_REMOVED") return `${candidateId} left the selected portfolio.`;
  if (kind === "KEEGAN_DECISION_ADDED") return `${candidateId} now requires a Keegan decision.`;
  if (kind === "KEEGAN_DECISION_CLEARED") return `${candidateId} no longer appears in the Keegan decision queue.`;
  return `${candidateId} changed within the canonical portfolio.`;
}

function materialChanges(
  change: DecisionPortfolioChangeV1 | null | undefined,
  currentPortfolioId: string,
  maxChanges: number,
): AutonomousGrowthBriefingChangeV1[] {
  if (!change || change.currentPortfolioId !== currentPortfolioId || change.status === "NO_CHANGE") return [];

  const values: AutonomousGrowthBriefingChangeV1[] = [];
  const seen = new Set<string>();
  const push = (kind: AutonomousGrowthBriefingChangeV1["kind"], candidateId: string) => {
    const key = `${kind}:${candidateId}`;
    if (seen.has(key) || values.length >= maxChanges) return;
    seen.add(key);
    values.push({
      kind,
      candidateId,
      summary: changeSummary(kind, candidateId),
      causeAttribution: "NOT_ESTABLISHED",
    });
  };

  for (const id of change.selectedAddedIds) push("SELECTED_ADDED", id);
  for (const id of change.selectedRemovedIds) push("SELECTED_REMOVED", id);
  for (const id of change.newKeeganDecisionIds) push("KEEGAN_DECISION_ADDED", id);
  for (const id of change.clearedKeeganDecisionIds) push("KEEGAN_DECISION_CLEARED", id);
  for (const item of change.candidateChanges) push("PORTFOLIO_DETAIL_CHANGED", item.candidateId);
  return values;
}

function emptyBriefing(
  status: Exclude<AutonomousGrowthBriefingStatusV1, "LIVE">,
  issues: readonly string[],
  portfolioId: string | null = null,
  generatedAt: string | null = null,
): AutonomousGrowthBriefingV1 {
  return deepFreeze({
    version: AUTONOMOUS_GROWTH_BRIEFING_VERSION_V1,
    status,
    decisionGrade: false,
    portfolioId,
    generatedAt,
    northStarTrajectory: {
      state: "UNKNOWN",
      summary: "Canonical North Star trajectory evidence is not part of this portfolio projection, so trajectory is not inferred.",
    },
    needsKeegan: [],
    selectedPortfolio: [],
    delegated: { JEEVES: [], IOANA: [] },
    campaigns: [],
    experiments: [],
    informationGain: [],
    opportunityCost: [],
    materialChanges: [],
    evidenceRefs: [],
    sourceRefs: [],
    issues: [...issues],
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}

/**
 * Produces an exception-first chief-of-staff projection from the verified,
 * persisted DecisionPortfolioV1 history. It deliberately refuses to turn a
 * stale/unverified portfolio into current action advice and does not treat a
 * selected item as proof that execution occurred.
 */
export function buildAutonomousGrowthBriefingV1(
  input: AutonomousGrowthBriefingInputV1,
): AutonomousGrowthBriefingV1 {
  const maxSelected = boundedInteger(input.maxSelected, 6, 12);
  const maxChanges = boundedInteger(input.maxChanges, 8, 20);
  const history = input.history;

  if (!history || !history.latestPortfolio || history.truthState === "UNVERIFIED") {
    return emptyBriefing("UNAVAILABLE", history?.issues ?? ["DECISION_PORTFOLIO_UNAVAILABLE"]);
  }

  if (history.truthState === "STALE" || !history.decisionGrade) {
    return emptyBriefing(
      "STALE",
      history.issues.length ? history.issues : ["DECISION_PORTFOLIO_STALE"],
      history.latestPortfolio.portfolioId,
      history.latestPortfolio.generatedAt,
    );
  }

  const portfolio = history.latestPortfolio;
  const byId = new Map(portfolio.items.map((item) => [item.candidate.id, item]));
  const selected = portfolio.selectedIds
    .map((id) => byId.get(id))
    .filter((item): item is DecisionPortfolioItemV1 => Boolean(item))
    .sort((left, right) => left.rank - right.rank || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, maxSelected)
    .map(toBriefingItem);
  const selectedById = new Map(selected.map((item) => [item.id, item]));
  const needsKeegan = portfolio.keeganDecisionIds
    .map((id) => selectedById.get(id))
    .filter((item): item is AutonomousGrowthBriefingItemV1 => Boolean(item));
  const opportunityCost = portfolio.items
    .map(toOpportunityCost)
    .filter((item): item is AutonomousGrowthOpportunityCostV1 => Boolean(item))
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
    .slice(0, maxSelected);
  const informationGainIds = new Set(portfolio.informationGainIds);
  const informationGain = opportunityCost.filter((item) => informationGainIds.has(item.id));

  return deepFreeze({
    version: AUTONOMOUS_GROWTH_BRIEFING_VERSION_V1,
    status: "LIVE",
    decisionGrade: true,
    portfolioId: portfolio.portfolioId,
    generatedAt: portfolio.generatedAt,
    northStarTrajectory: {
      state: "UNKNOWN",
      summary: "Canonical North Star trajectory evidence is not part of this portfolio projection, so trajectory is not inferred.",
    },
    needsKeegan,
    selectedPortfolio: selected,
    delegated: {
      JEEVES: selected.filter((item) => item.owner === "JEEVES"),
      IOANA: selected.filter((item) => item.owner === "IOANA"),
    },
    campaigns: selected.filter((item) => item.candidateType === "CAMPAIGN"),
    experiments: selected.filter((item) => item.candidateType === "EXPERIMENT"),
    informationGain,
    opportunityCost,
    materialChanges: materialChanges(input.change, portfolio.portfolioId, maxChanges),
    evidenceRefs: [...portfolio.evidenceRefs],
    sourceRefs: [...portfolio.sourceRefs],
    issues: [],
    limitations: [...LIMITATIONS],
    authority: AUTHORITY,
  });
}

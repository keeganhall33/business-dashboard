import {
  DECISION_PRECEDENT_RETRIEVAL_VERSION_V1,
  type CurrentDecisionMemoryQueryV1,
  type DecisionPrecedentMatchV1,
  type DecisionPrecedentRetrievalV1,
  type DecisionPrecedentV1,
  type PrecedentRelevanceV1
} from "./contracts";
import { CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, DECISION_PRECEDENT_FIXTURES_V1 } from "./fixtures";

const relevanceRank: Record<PrecedentRelevanceV1, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  DO_NOT_USE: 3
};

const attributionRank = {
  HIGH: 0,
  MEDIUM: 1,
  UNKNOWN: 2,
  LOW: 3
} as const;

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).sort();
}

function chosenOptionTags(precedent: DecisionPrecedentV1): string[] {
  return precedent.OPTIONS_CONSIDERED
    .filter((option) => option.was_chosen)
    .flatMap((option) => [option.option_id, option.label.toLowerCase().replaceAll(/\s+/g, "-")])
    .sort();
}

function evidenceIds(precedent: DecisionPrecedentV1): string[] {
  return precedent.KEY_EVIDENCE.map((item) => item.evidence_id).sort();
}

function materialDifferences(query: CurrentDecisionMemoryQueryV1, precedent: DecisionPrecedentV1): string[] {
  const differences: string[] = [];
  if (precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE") {
    differences.push("Prior context had fixed delivery pressure; current decision is a bounded validation step.");
  }
  if (precedent.CONTEXT_TAGS.includes("public-attention") || precedent.CONTEXT_TAGS.includes("volume")) {
    differences.push("Prior decision depended on public attention/volume; current decision is scarcity-safe private validation.");
  }
  if (precedent.ATTRIBUTION_CONFIDENCE === "LOW") {
    differences.push("Prior outcome had LOW attribution confidence and cannot dominate this recommendation.");
  }
  if (intersection(query.context_tags, precedent.CONTEXT_TAGS).length === 0) {
    differences.push("No shared decision context tags.");
  }
  return differences.sort();
}

function relevanceFor(match: Omit<DecisionPrecedentMatchV1, "PRECEDENT_RELEVANCE" | "dashboard_flags">): PrecedentRelevanceV1 {
  if (match.precedent.ATTRIBUTION_CONFIDENCE === "LOW") return "DO_NOT_USE";
  if (match.precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE") return "LOW";
  if (match.SIMILARITY_FACTORS.shared_context_tags.length >= 3) return "HIGH";
  if (match.precedent.PREFERENCE_SIGNAL_CLASS === "FAILED_PATTERN" && match.WHAT_DIFFERS_NOW.length > 0) return "MEDIUM";
  if (match.SIMILARITY_FACTORS.shared_context_tags.length > 0 || match.SIMILARITY_FACTORS.shared_option_tags.length > 0) return "MEDIUM";
  return "LOW";
}

export function matchDecisionPrecedentV1(
  query: CurrentDecisionMemoryQueryV1,
  precedent: DecisionPrecedentV1
): DecisionPrecedentMatchV1 {
  const factors = {
    shared_context_tags: intersection(query.context_tags, precedent.CONTEXT_TAGS),
    shared_option_tags: intersection(query.option_tags, chosenOptionTags(precedent)),
    shared_evidence_refs: intersection(query.evidence_refs, evidenceIds(precedent)),
    assumption_overlap: intersection(query.key_assumptions, precedent.KEY_ASSUMPTIONS),
    material_differences: materialDifferences(query, precedent)
  };
  const base = {
    precedent,
    SIMILARITY_FACTORS: factors,
    WHAT_DIFFERS_NOW: factors.material_differences.length > 0
      ? factors.material_differences
      : ["No material difference captured in deterministic fixture."]
  };
  const relevance = relevanceFor(base);

  return {
    ...base,
    PRECEDENT_RELEVANCE: relevance,
    dashboard_flags: {
      can_inform_current_decision: relevance !== "DO_NOT_USE",
      can_become_preference_rule: false,
      low_attribution_cannot_dominate: precedent.ATTRIBUTION_CONFIDENCE === "LOW",
      superficially_similar_only: precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE" || relevance === "LOW"
    }
  };
}

export function retrieveDecisionPrecedentsV1(
  query: CurrentDecisionMemoryQueryV1 = CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1,
  precedents: DecisionPrecedentV1[] = DECISION_PRECEDENT_FIXTURES_V1,
  generated_at = "2026-08-19T00:00:00.000Z"
): DecisionPrecedentRetrievalV1 {
  const matches = precedents
    .map((precedent) => matchDecisionPrecedentV1(query, precedent))
    .sort((a, b) => (
      relevanceRank[a.PRECEDENT_RELEVANCE] - relevanceRank[b.PRECEDENT_RELEVANCE] ||
      attributionRank[a.precedent.ATTRIBUTION_CONFIDENCE] - attributionRank[b.precedent.ATTRIBUTION_CONFIDENCE] ||
      b.SIMILARITY_FACTORS.shared_context_tags.length - a.SIMILARITY_FACTORS.shared_context_tags.length ||
      b.SIMILARITY_FACTORS.shared_option_tags.length - a.SIMILARITY_FACTORS.shared_option_tags.length ||
      a.precedent.DECISION_ID.localeCompare(b.precedent.DECISION_ID)
    ));

  const usable = matches.filter((match) => match.dashboard_flags.can_inform_current_decision);

  return {
    retrieval_version: DECISION_PRECEDENT_RETRIEVAL_VERSION_V1,
    current_decision_id: query.decision_id,
    generated_at,
    source_mode: "DETERMINISTIC_FIXTURE",
    matches,
    dashboard_summary: {
      top_precedent_id: matches[0]?.precedent.DECISION_ID ?? null,
      strongest_relevance: matches[0]?.PRECEDENT_RELEVANCE ?? "NONE",
      usable_precedent_count: usable.length,
      blocked_low_attribution_count: matches.filter((match) => match.precedent.ATTRIBUTION_CONFIDENCE === "LOW").length,
      current_context_difference_count: matches.filter((match) => match.precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE").length
    },
    keegan_action_required: "NO"
  };
}

export const DECISION_PRECEDENT_RETRIEVAL_FIXTURE_V1 = retrieveDecisionPrecedentsV1();

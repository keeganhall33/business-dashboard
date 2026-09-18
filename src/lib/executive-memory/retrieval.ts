import {
  DECISION_PRECEDENT_RETRIEVAL_VERSION_V1,
  DECISION_PRECEDENT_VERSION_V1,
  type CurrentDecisionMemoryQueryV1,
  type DecisionPrecedentEvidenceIntegrityV1,
  type DecisionPrecedentMatchV1,
  type DecisionPrecedentRetrievalV1,
  type DecisionPrecedentV1,
  type PrecedentRelevanceV1
} from "./contracts";
import { CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, DECISION_PRECEDENT_FIXTURES_V1 } from "./fixtures";

const MAX_PRECEDENTS_PER_RETRIEVAL = 100;

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

function assertNonEmptyString(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be a non-empty string`);
}

function assertCanonicalTimestamp(value: string, label: string): void {
  assertNonEmptyString(value, label);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
}

function assertUniqueStrings(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmptyString(value, `${label} item`);
    if (seen.has(value)) throw new Error(`${label} contains duplicate value ${value}`);
    seen.add(value);
  }
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item)).sort();
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

export function precedentEvidenceIntegrityV1(precedent: DecisionPrecedentV1): DecisionPrecedentEvidenceIntegrityV1 {
  const truthStates = new Set(precedent.KEY_EVIDENCE.map((item) => item.truth_state));
  if (truthStates.has("CONFLICTED")) return "CONFLICTED";
  if (truthStates.has("KNOWN")) return "SUPPORTED";
  if (truthStates.has("INFERRED")) return "INFERRED_ONLY";
  return "UNKNOWN_ONLY";
}

function materialDifferences(query: CurrentDecisionMemoryQueryV1, precedent: DecisionPrecedentV1): string[] {
  const differences: string[] = [];

  for (const tag of difference(query.context_tags, precedent.CONTEXT_TAGS)) {
    differences.push(`Current-only context tag: ${tag}.`);
  }
  for (const tag of difference(precedent.CONTEXT_TAGS, query.context_tags)) {
    differences.push(`Precedent-only context tag: ${tag}.`);
  }

  if (precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE") {
    differences.push("Precedent is explicitly classified as CURRENT_CONTEXT_DIFFERENCE; specific differences require evidence from the supplied records.");
  }
  if (precedent.ATTRIBUTION_CONFIDENCE === "LOW") {
    differences.push("Prior outcome attribution is LOW and cannot dominate the current decision.");
  }

  return differences.sort();
}

function relevanceFor(
  match: Omit<DecisionPrecedentMatchV1, "PRECEDENT_RELEVANCE" | "dashboard_flags">,
  evidenceIntegrity: DecisionPrecedentEvidenceIntegrityV1
): PrecedentRelevanceV1 {
  if (match.precedent.ATTRIBUTION_CONFIDENCE === "LOW") return "DO_NOT_USE";
  if (evidenceIntegrity === "CONFLICTED" || evidenceIntegrity === "UNKNOWN_ONLY") return "DO_NOT_USE";
  if (match.precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE") return "LOW";
  if (evidenceIntegrity === "INFERRED_ONLY") return "LOW";
  if (match.SIMILARITY_FACTORS.shared_context_tags.length >= 3) return "HIGH";
  if (match.precedent.PREFERENCE_SIGNAL_CLASS === "FAILED_PATTERN" && match.WHAT_DIFFERS_NOW.length > 0) return "MEDIUM";
  if (match.SIMILARITY_FACTORS.shared_context_tags.length > 0 || match.SIMILARITY_FACTORS.shared_option_tags.length > 0) return "MEDIUM";
  return "LOW";
}

function validatePrecedent(query: CurrentDecisionMemoryQueryV1, precedent: DecisionPrecedentV1): void {
  if (precedent.contract_version !== DECISION_PRECEDENT_VERSION_V1) {
    throw new Error(`Unsupported precedent contract version for ${precedent.DECISION_ID}`);
  }
  assertNonEmptyString(precedent.DECISION_ID, "precedent DECISION_ID");
  if (precedent.DECISION_ID === query.decision_id) {
    throw new Error(`Current decision ${query.decision_id} cannot be used as its own precedent`);
  }
  assertUniqueStrings(precedent.CONTEXT_TAGS, `${precedent.DECISION_ID} CONTEXT_TAGS`);
  assertUniqueStrings(precedent.KEY_ASSUMPTIONS, `${precedent.DECISION_ID} KEY_ASSUMPTIONS`);
  assertUniqueStrings(evidenceIds(precedent), `${precedent.DECISION_ID} KEY_EVIDENCE ids`);
}

function validateRetrievalInputs(query: CurrentDecisionMemoryQueryV1, precedents: DecisionPrecedentV1[], generatedAt: string): void {
  assertNonEmptyString(query.decision_id, "query decision_id");
  assertNonEmptyString(query.recommendation_id, "query recommendation_id");
  assertUniqueStrings(query.context_tags, "query context_tags");
  assertUniqueStrings(query.option_tags, "query option_tags");
  assertUniqueStrings(query.evidence_refs, "query evidence_refs");
  assertUniqueStrings(query.key_assumptions, "query key_assumptions");
  assertCanonicalTimestamp(generatedAt, "generated_at");

  if (precedents.length > MAX_PRECEDENTS_PER_RETRIEVAL) {
    throw new Error(`Precedent retrieval is bounded to ${MAX_PRECEDENTS_PER_RETRIEVAL} records`);
  }

  const ids = new Set<string>();
  for (const precedent of precedents) {
    validatePrecedent(query, precedent);
    if (ids.has(precedent.DECISION_ID)) throw new Error(`Duplicate precedent DECISION_ID ${precedent.DECISION_ID}`);
    ids.add(precedent.DECISION_ID);
  }
}

export function matchDecisionPrecedentV1(
  query: CurrentDecisionMemoryQueryV1,
  precedent: DecisionPrecedentV1
): DecisionPrecedentMatchV1 {
  validatePrecedent(query, precedent);
  const evidenceIntegrity = precedentEvidenceIntegrityV1(precedent);
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
      : ["No material difference is established by the supplied structured evidence."]
  };
  const relevance = relevanceFor(base, evidenceIntegrity);

  return {
    ...base,
    PRECEDENT_RELEVANCE: relevance,
    dashboard_flags: {
      can_inform_current_decision: relevance !== "DO_NOT_USE",
      can_become_preference_rule: false,
      low_attribution_cannot_dominate: precedent.ATTRIBUTION_CONFIDENCE === "LOW",
      superficially_similar_only: precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE" || relevance === "LOW",
      evidence_integrity_state: evidenceIntegrity,
      requires_evidence_verification: evidenceIntegrity !== "SUPPORTED"
    }
  };
}

export function retrieveDecisionPrecedentsV1(
  query?: CurrentDecisionMemoryQueryV1,
  precedents?: DecisionPrecedentV1[],
  generated_at = "2026-08-19T00:00:00.000Z"
): DecisionPrecedentRetrievalV1 {
  const hasCallerQuery = query !== undefined;
  const hasCallerPrecedents = precedents !== undefined;
  if (hasCallerQuery !== hasCallerPrecedents) {
    throw new Error("Caller-supplied precedent retrieval requires both query and precedents; fixture and caller data cannot be mixed");
  }

  const effectiveQuery = query ?? CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1;
  const effectivePrecedents = precedents ?? DECISION_PRECEDENT_FIXTURES_V1;
  validateRetrievalInputs(effectiveQuery, effectivePrecedents, generated_at);

  const matches = effectivePrecedents
    .map((precedent) => matchDecisionPrecedentV1(effectiveQuery, precedent))
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
    current_decision_id: effectiveQuery.decision_id,
    generated_at,
    source_mode: hasCallerQuery ? "CALLER_SUPPLIED" : "DETERMINISTIC_FIXTURE",
    matches,
    dashboard_summary: {
      top_precedent_id: matches[0]?.precedent.DECISION_ID ?? null,
      strongest_relevance: matches[0]?.PRECEDENT_RELEVANCE ?? "NONE",
      usable_precedent_count: usable.length,
      blocked_low_attribution_count: matches.filter((match) => match.precedent.ATTRIBUTION_CONFIDENCE === "LOW").length,
      current_context_difference_count: matches.filter((match) => match.precedent.PREFERENCE_SIGNAL_CLASS === "CURRENT_CONTEXT_DIFFERENCE").length,
      evidence_verification_count: matches.filter((match) => match.dashboard_flags.requires_evidence_verification).length
    },
    keegan_action_required: "NO"
  };
}

export const DECISION_PRECEDENT_RETRIEVAL_FIXTURE_V1 = retrieveDecisionPrecedentsV1();
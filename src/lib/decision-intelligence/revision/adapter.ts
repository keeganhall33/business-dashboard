import type {
  RecommendationDecisionDiffV1,
  RecommendationRevisionInputV1,
  RecommendationRevisionResultV1,
  RecommendationRevisionVersionV1
} from "./contracts";

const confidenceRank = {
  insufficient_evidence: 0,
  possible: 1,
  likely: 2,
  strongly_supported: 3,
  confirmed: 4
} as const;

const mutatingClassifications = new Set(["HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION", "DECISION_COMMITMENT"]);

function cloneVersion(version: RecommendationRevisionVersionV1): RecommendationRevisionVersionV1 {
  return {
    ...version,
    evidence_refs: version.evidence_refs.map((item) => ({ ...item, provenance: { ...item.provenance } })),
    assumptions: version.assumptions.map((item) => ({ ...item, evidence_refs: [...item.evidence_refs] })),
    unknowns: [...version.unknowns],
    conflicts: [...version.conflicts]
  };
}

function confidenceDelta(before: RecommendationRevisionVersionV1, after: RecommendationRevisionVersionV1): RecommendationDecisionDiffV1["confidence_delta"] {
  const beforeRank = confidenceRank[before.confidence];
  const afterRank = confidenceRank[after.confidence];
  const direction = afterRank > beforeRank ? "UP" : afterRank < beforeRank ? "DOWN" : "UNCHANGED";

  return {
    before: before.confidence,
    after: after.confidence,
    direction,
    reason: direction === "UP"
      ? "New provenance strengthened the recommendation."
      : direction === "DOWN"
        ? "Correction or conflict lowered confidence."
        : "New input did not change confidence."
  };
}

function buildDiff(input: {
  before: RecommendationRevisionVersionV1;
  after: RecommendationRevisionVersionV1;
  why_changed: string[];
}): RecommendationDecisionDiffV1 {
  const beforeEvidence = new Set(input.before.evidence_refs.map((item) => item.evidence_id));
  const afterEvidence = new Set(input.after.evidence_refs.map((item) => item.evidence_id));

  return {
    recommendation_id: input.before.recommendation_id,
    previous_version: input.before.version,
    next_version: input.after.version,
    before: {
      recommendation_summary: input.before.recommendation_summary,
      recommended_action: input.before.recommended_action,
      urgency: input.before.urgency,
      approval_level: input.before.approval_level,
      confidence: input.before.confidence,
      unknowns: [...input.before.unknowns],
      conflicts: [...input.before.conflicts]
    },
    after: {
      recommendation_summary: input.after.recommendation_summary,
      recommended_action: input.after.recommended_action,
      urgency: input.after.urgency,
      approval_level: input.after.approval_level,
      confidence: input.after.confidence,
      unknowns: [...input.after.unknowns],
      conflicts: [...input.after.conflicts]
    },
    changed_assumption_ids: input.after.assumptions
      .filter((afterAssumption) => {
        const beforeAssumption = input.before.assumptions.find((item) => item.assumption_id === afterAssumption.assumption_id);
        return !beforeAssumption || beforeAssumption.state !== afterAssumption.state || beforeAssumption.detail !== afterAssumption.detail;
      })
      .map((item) => item.assumption_id)
      .sort(),
    added_evidence_ids: [...afterEvidence].filter((id) => !beforeEvidence.has(id)).sort(),
    preserved_evidence_ids: [...beforeEvidence].filter((id) => afterEvidence.has(id)).sort(),
    confidence_delta: confidenceDelta(input.before, input.after),
    action_delta: input.before.recommended_action === input.after.recommended_action ? "UNCHANGED" : "CHANGED",
    urgency_delta: input.before.urgency === input.after.urgency ? "UNCHANGED" : "CHANGED",
    approval_class_delta: input.before.approval_level === input.after.approval_level ? "UNCHANGED" : "CHANGED",
    why_changed: [...input.why_changed]
  };
}

export function reviseRecommendationVersionV1(input: {
  current: RecommendationRevisionVersionV1;
  revisionInput: RecommendationRevisionInputV1;
  priorVersions?: RecommendationRevisionVersionV1[];
}): RecommendationRevisionResultV1 {
  const oldRecommendation = cloneVersion(input.current);
  const priorVersions = (input.priorVersions ?? []).map(cloneVersion);
  const isHypothetical = input.revisionInput.classification === "HYPOTHETICAL";
  const canMutate = mutatingClassifications.has(input.revisionInput.classification) && !isHypothetical;

  if (!canMutate) {
    return {
      contract_version: "recommendation_revision_v1",
      input_id: input.revisionInput.input_id,
      classification: input.revisionInput.classification,
      facts_mutated: false,
      memory_mutated: false,
      old_recommendation: oldRecommendation,
      active_recommendation: cloneVersion(input.current),
      preserved_versions: priorVersions,
      diff: null,
      provenance: { ...input.revisionInput.provenance, memory_write_allowed: false },
      hypothetical_not_promoted_to_fact: isHypothetical,
      unknowns_explicit: input.current.unknowns.length > 0,
      conflicted_evidence_explicit: input.current.evidence_refs.some((item) => item.truth_state === "CONFLICTED") || input.current.conflicts.length > 0,
      keegan_action_required: "NO"
    };
  }

  const proposed = input.revisionInput.proposed_changes ?? {};
  const addedEvidence = proposed.evidence_to_add ?? [];
  const changedAssumptions = proposed.changed_assumptions ?? [];
  const changedAssumptionIds = new Set(changedAssumptions.map((item) => item.assumption_id));
  const after: RecommendationRevisionVersionV1 = {
    ...cloneVersion(input.current),
    version: input.current.version + 1,
    recommendation_summary: proposed.recommendation_summary ?? input.current.recommendation_summary,
    recommended_action: proposed.recommended_action ?? input.current.recommended_action,
    urgency: proposed.urgency ?? input.current.urgency,
    approval_level: proposed.approval_level ?? input.current.approval_level,
    confidence: proposed.confidence ?? input.current.confidence,
    evidence_refs: [...input.current.evidence_refs.map((item) => ({ ...item, provenance: { ...item.provenance } })), ...addedEvidence.map((item) => ({ ...item, provenance: { ...item.provenance } }))],
    assumptions: [
      ...input.current.assumptions
        .filter((item) => !changedAssumptionIds.has(item.assumption_id))
        .map((item) => ({ ...item, evidence_refs: [...item.evidence_refs] })),
      ...changedAssumptions.map((item) => ({ ...item, evidence_refs: [...item.evidence_refs] }))
    ].sort((a, b) => a.assumption_id.localeCompare(b.assumption_id)),
    unknowns: proposed.unknowns ? [...proposed.unknowns] : [...input.current.unknowns],
    conflicts: proposed.conflicts ? [...proposed.conflicts] : [...input.current.conflicts],
    created_from_input_id: input.revisionInput.input_id
  };

  const diff = buildDiff({
    before: oldRecommendation,
    after,
    why_changed: proposed.why_changed ?? [input.revisionInput.interpreted_claim ?? input.revisionInput.utterance]
  });

  return {
    contract_version: "recommendation_revision_v1",
    input_id: input.revisionInput.input_id,
    classification: input.revisionInput.classification,
    facts_mutated: true,
    memory_mutated: input.revisionInput.provenance.memory_write_allowed,
    old_recommendation: oldRecommendation,
    active_recommendation: after,
    preserved_versions: [...priorVersions, oldRecommendation],
    diff,
    provenance: { ...input.revisionInput.provenance },
    hypothetical_not_promoted_to_fact: false,
    unknowns_explicit: after.unknowns.length > 0 || after.evidence_refs.some((item) => item.truth_state === "UNKNOWN"),
    conflicted_evidence_explicit: after.conflicts.length > 0 || after.evidence_refs.some((item) => item.truth_state === "CONFLICTED"),
    keegan_action_required: "NO"
  };
}

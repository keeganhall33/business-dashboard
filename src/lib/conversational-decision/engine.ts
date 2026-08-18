import type {
  ConversationalDecisionAnswerV1,
  ConversationalDecisionFixtureV1,
  ConversationalDecisionTurnV1,
  RecommendationRevisionV1,
  RecommendationVersionV1
} from "./contracts";

const MUTATING_CLASSIFICATIONS = new Set(["HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"]);

function cloneVersion(version: RecommendationVersionV1): RecommendationVersionV1 {
  return {
    ...version,
    evidence_refs: version.evidence_refs.map((item) => ({ ...item })),
    assumptions: version.assumptions.map((item) => ({ ...item, evidence_refs: [...item.evidence_refs] })),
    unknowns: [...version.unknowns],
    conflicts: [...version.conflicts]
  };
}

function answerWhy(turn: ConversationalDecisionTurnV1, current: RecommendationVersionV1, priorVersions: RecommendationVersionV1[]): ConversationalDecisionAnswerV1 {
  return {
    turn_id: turn.turn_id,
    classification: turn.classification,
    spoken_answer: "Because prestige fit is known, while access and direct economics are still unknown.",
    written_answer: `${current.why} The recommendation stays at ${current.approval_level} because the evidence supports a validation step, not a committed event build.`,
    evidence_refs: current.evidence_refs,
    assumptions: current.assumptions,
    unknowns: current.unknowns,
    conflicts: current.conflicts,
    approval_level: current.approval_level,
    facts_mutated: false,
    revision: null,
    active_recommendation_version: current,
    prior_versions: priorVersions
  };
}

function answerHypothetical(turn: ConversationalDecisionTurnV1, current: RecommendationVersionV1, priorVersions: RecommendationVersionV1[]): ConversationalDecisionAnswerV1 {
  const projected = turn.hypothetical_overlay?.projected_changes.join("; ") ?? "No projected changes supplied.";

  return {
    turn_id: turn.turn_id,
    classification: turn.classification,
    spoken_answer: "If sponsorship is only hypothetical, cost risk improves in the scenario but the stored recommendation does not change.",
    written_answer: `Hypothetical scenario: ${turn.hypothetical_overlay?.scenario ?? turn.user_utterance} Projected effect: ${projected}. This is not recorded as a fact and does not create a new recommendation version.`,
    evidence_refs: current.evidence_refs.map((item) => ({ ...item, truth_state: item.truth_state === "UNKNOWN" ? "HYPOTHETICAL_ONLY" : item.truth_state })),
    assumptions: current.assumptions,
    unknowns: current.unknowns,
    conflicts: current.conflicts,
    approval_level: current.approval_level,
    facts_mutated: false,
    revision: null,
    active_recommendation_version: current,
    prior_versions: priorVersions
  };
}

function reviseFromHumanReportedFact(turn: ConversationalDecisionTurnV1, current: RecommendationVersionV1, priorVersions: RecommendationVersionV1[]): ConversationalDecisionAnswerV1 {
  const addedEvidence = {
    id: "ev-human-confirmed-host-intro",
    label: "Confirmed host introduction",
    source: turn.turn_id,
    provenance: "HUMAN_REPORTED" as const,
    truth_state: "KNOWN" as const,
    detail: turn.interpreted_claim ?? turn.user_utterance
  };
  const next: RecommendationVersionV1 = {
    ...cloneVersion(current),
    version: current.version + 1,
    recommendation_summary: "Use the confirmed warm host introduction to validate the private collector room access path before any full build.",
    recommended_action: "Take the warm intro, verify host/sponsor decision-maker access, and only then decide whether to prepare the prestige-event concept.",
    why: "The human-reported warm introduction resolves the access-path unknown, but direct economics remain unknown.",
    evidence_refs: [...current.evidence_refs.map((item) => ({ ...item })), addedEvidence],
    assumptions: current.assumptions.map((item) =>
      item.id === "as-access-can-be-tested"
        ? { ...item, state: "CONFIRMED" as const, evidence_refs: [...item.evidence_refs, addedEvidence.id] }
        : { ...item, evidence_refs: [...item.evidence_refs] }
    ),
    unknowns: current.unknowns.filter((item) => item !== "Verified host/sponsor route"),
    created_from_turn_id: turn.turn_id
  };
  const revision: RecommendationRevisionV1 = {
    recommendation_id: current.recommendation_id,
    previous_version: current.version,
    next_version: next.version,
    before: {
      recommendation_summary: current.recommendation_summary,
      recommended_action: current.recommended_action,
      approval_level: current.approval_level,
      unknowns: current.unknowns,
      conflicts: current.conflicts
    },
    after: {
      recommendation_summary: next.recommendation_summary,
      recommended_action: next.recommended_action,
      approval_level: next.approval_level,
      unknowns: next.unknowns,
      conflicts: next.conflicts
    },
    why_changed: ["Human-reported fact resolves the access-path unknown.", "Prior recommendation version remains preserved for audit."],
    preserved_evidence_refs: current.evidence_refs.map((item) => item.id),
    added_evidence_refs: [addedEvidence.id]
  };

  return {
    turn_id: turn.turn_id,
    classification: turn.classification,
    spoken_answer: "That changes the recommendation version: access validation now has a concrete warm-intro path.",
    written_answer: `${revision.why_changed.join(" ")} Direct economics are still UNKNOWN, so approval remains ${next.approval_level}.`,
    evidence_refs: next.evidence_refs,
    assumptions: next.assumptions,
    unknowns: next.unknowns,
    conflicts: next.conflicts,
    approval_level: next.approval_level,
    facts_mutated: true,
    revision,
    active_recommendation_version: next,
    prior_versions: [...priorVersions, current]
  };
}

export function answerConversationalDecisionTurnV1(input: {
  fixture: ConversationalDecisionFixtureV1;
  turn: ConversationalDecisionTurnV1;
}): ConversationalDecisionAnswerV1 {
  const current = cloneVersion(input.fixture.current_version);
  const priorVersions = input.fixture.prior_versions.map(cloneVersion);

  if (input.turn.classification === "HYPOTHETICAL") {
    return answerHypothetical(input.turn, current, priorVersions);
  }

  if (MUTATING_CLASSIFICATIONS.has(input.turn.classification) && input.turn.classification === "HUMAN_REPORTED_FACT") {
    return reviseFromHumanReportedFact(input.turn, current, priorVersions);
  }

  return answerWhy(input.turn, current, priorVersions);
}

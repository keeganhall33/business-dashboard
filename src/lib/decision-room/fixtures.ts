import type { DecisionRoomViewModelV1 } from "./contracts";
import { withDecisionRoomConversationRevisionV1 } from "./conversation-revision";

export const DECISION_ROOM_FIXTURE_V1: DecisionRoomViewModelV1 = {
  contract_version: "decision_room_view_model_v1",
  decision_id: "decision-private-collector-room",
  generated_at: "2026-08-18T00:00:00.000Z",
  source_mode: "DETERMINISTIC_FIXTURE",
  breadcrumb: ["Home", "Strategy", "Private collector room", "Decision Room"],
  current_recommendation: {
    recommendation_id: "rec-private-collector-room-access-validation",
    title: "Private collector room access validation",
    summary: "Validate one credible access path before investing in a full private collector room concept.",
    next_action: "Ask for one warm host or sponsor route and record whether it reaches an actual decision-maker."
  },
  confidence: "likely",
  evidence_refs: [
    {
      ref_id: "strategy-prepare-creative-direction",
      label: "Strategy fixture: premium positioning priority",
      provenance: "STRATEGY_FIXTURE",
      truth_state: "INFERRED",
      detail: "Strategy favors scarce, authority-building moves over volume tactics."
    },
    {
      ref_id: "ev_fixture_meta_delivery_snapshot",
      label: "Evidence fixture: attribution conflict remains visible",
      provenance: "EVIDENCE_TRUST_FIXTURE",
      truth_state: "CONFLICTED",
      detail: "Data/evidence trust keeps platform attribution conflict visible instead of averaging it away."
    },
    {
      ref_id: "learn-low-attribution-meta-003",
      label: "Learning fixture: weak signal only",
      provenance: "LEARNING_FIXTURE",
      truth_state: "UNKNOWN",
      detail: "Learning cannot update policy when attribution is low and outcome remains unknown."
    },
    {
      ref_id: "project-economics-strategic-weak-direct",
      label: "Financial fixture: weak direct economics",
      provenance: "FINANCIAL_FIXTURE",
      truth_state: "UNKNOWN",
      detail: "Direct economics are not proven and qualitative prestige value is not converted into fabricated dollars."
    }
  ],
  assumptions_unknowns: [
    {
      assumption_id: "as-access-path-testable",
      label: "A warm access path can be tested cheaply before concept buildout.",
      truth_state: "INFERRED",
      evidence_refs: ["strategy-prepare-creative-direction"],
      why_it_matters: "Without access, the concept becomes speculative exposure rather than a premium relationship move."
    },
    {
      assumption_id: "as-direct-economics",
      label: "Direct event economics",
      truth_state: "UNKNOWN",
      evidence_refs: ["project-economics-strategic-weak-direct"],
      why_it_matters: "UNKNOWN direct economics must not be treated as zero cost or proven upside."
    },
    {
      assumption_id: "as-attribution-quality",
      label: "Attribution quality",
      truth_state: "CONFLICTED",
      evidence_refs: ["ev_fixture_meta_delivery_snapshot", "learn-low-attribution-meta-003"],
      why_it_matters: "Conflicted attribution blocks spend-like conclusions from this slice."
    }
  ],
  alternatives: [
    {
      alternative_id: "alt-build-full-concept-now",
      label: "Build the full private collector room concept now",
      tradeoff: "Higher narrative upside, but it commits attention before access and economics are known.",
      evidence_refs: ["project-economics-strategic-weak-direct"]
    },
    {
      alternative_id: "alt-ignore-event-path",
      label: "Ignore the event path and keep studio focus only",
      tradeoff: "Protects studio time, but may miss a high-prestige relationship test.",
      evidence_refs: ["strategy-prepare-creative-direction"]
    }
  ],
  opportunity_cost_note: "Every hour spent shaping an unverified room delays scarce graphite-led work that already fits premium positioning.",
  specialist_disagreement: [
    {
      specialist: "STRATEGY",
      stance: "SUPPORTS",
      summary: "Supports a narrow validation step because the brand upside is plausible and reversible.",
      evidence_refs: ["strategy-prepare-creative-direction"],
      visible_in_dashboard: true
    },
    {
      specialist: "FINANCIAL",
      stance: "CHALLENGES",
      summary: "Challenges any full build because direct economics are UNKNOWN and weak direct economics remain possible.",
      evidence_refs: ["project-economics-strategic-weak-direct"],
      visible_in_dashboard: true
    },
    {
      specialist: "DATA_EVIDENCE",
      stance: "NEEDS_MORE_EVIDENCE",
      summary: "Requires cleaner evidence before converting prestige optionality into an execution recommendation.",
      evidence_refs: ["ev_fixture_meta_delivery_snapshot"],
      visible_in_dashboard: true
    }
  ],
  strongest_argument_against: "The concept could consume attention while producing only soft prestige signals and no verified buyer, sponsor, or host access.",
  weakest_assumption: {
    assumption_id: "as-direct-economics",
    label: "Direct event economics",
    truth_state: "UNKNOWN",
    evidence_refs: ["project-economics-strategic-weak-direct"],
    why_it_matters: "A full build cannot be justified if direct costs and buyer/sponsor paths remain unknown."
  },
  WHAT_WOULD_CHANGE_MY_MIND: [
    "A confirmed host or sponsor intro reaches an actual decision-maker.",
    "Direct costs and sponsor coverage become known rather than UNKNOWN.",
    "A collector access path fails, reducing the concept to general exposure."
  ],
  next_action: "Run the smallest access validation and keep the full concept blocked until evidence changes.",
  approval_class: "L1_RECOMMENDATION",
  challenge: {
    active: false,
    red_team_summary: "No red-team override is active in the baseline fixture.",
    recommendation_overwritten: false,
    disagreement_visible: true
  }
};

export const DECISION_ROOM_CHALLENGE_FIXTURE_V1: DecisionRoomViewModelV1 = {
  ...DECISION_ROOM_FIXTURE_V1,
  decision_id: "decision-private-collector-room-challenge",
  generated_at: "2026-08-18T00:05:00.000Z",
  specialist_disagreement: [
    ...DECISION_ROOM_FIXTURE_V1.specialist_disagreement,
    {
      specialist: "LEARNING",
      stance: "CHALLENGES",
      summary: "Prior weak-attribution learning says not to treat ambiguous prestige signals as policy evidence.",
      evidence_refs: ["learn-low-attribution-meta-003"],
      visible_in_dashboard: true
    }
  ],
  strongest_argument_against: "Red-team challenge: this may be a prestige-sounding distraction unless a real access path appears.",
  challenge: {
    active: true,
    red_team_summary: "Challenge is visible, but it cannot silently overwrite the current recommendation.",
    recommendation_overwritten: false,
    disagreement_visible: true
  }
};

export const DECISION_ROOM_CONVERSATION_REVISION_FIXTURE_V1: DecisionRoomViewModelV1 =
  withDecisionRoomConversationRevisionV1(DECISION_ROOM_FIXTURE_V1);

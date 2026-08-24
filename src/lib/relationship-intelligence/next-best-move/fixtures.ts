import { buildRelationshipNextBestMoveViewModelV1 } from "./adapter";
import type { RelationshipNextBestMoveTargetInputV1 } from "./contracts";

const RELATIONSHIP_NEXT_BEST_MOVE_TARGETS_UNSORTED_V1 = [
  {
    target_id: "crm-collector-warm-path-avery",
    target_label: "Avery Morgan collector circle",
    crm_segment: "COLLECTOR",
    relationship_state: "KNOWN",
    relationship_state_detail: "Existing collector-adjacent relationship with a known private bridge; no outreach is performed by this adapter.",
    warm_path: {
      introducer_name: "Avery Morgan",
      path_detail: "Known private bridge to a collector circle; use only for internal planning until Keegan approves outreach.",
      evidence_state: "KNOWN"
    },
    last_meaningful_interaction: {
      happened_at: "2026-08-18T16:30:00.000Z",
      label: "Private studio-context conversation logged as meaningful relationship context.",
      freshness: "FRESH",
      evidence_state: "KNOWN"
    },
    active_ask_or_commitment: {
      summary: "No active ask; prepare value framing only.",
      evidence_state: "KNOWN"
    },
    why_relationship_matters: "A qualified collector bridge can create high-trust signal without public accessibility framing.",
    cultural_power_map_context: {
      role: "BRIDGE",
      evidence_state: "INFERRED",
      detail: "Bridge role is inferred from relationship context, not scored."
    },
    timing_window: {
      label: "THIS_WEEK_INTERNAL_PREP",
      evidence_state: "KNOWN",
      rationale: "Fresh interaction supports internal prep; it does not authorize outreach."
    },
    key_unknown_or_blocker: "Exact collector appetite remains UNKNOWN until Keegan approves a private validation path.",
    evidence_refs: ["crm-private-bridge-avery", "collector-circle-context", "premium-scarcity-fit"],
    what_would_change_the_recommendation: [
      "Avery declines to act as a bridge.",
      "Collector appetite is confirmed or contradicted.",
      "Keegan approves or rejects a specific outreach draft."
    ]
  },
  {
    target_id: "crm-media-stale-boardroom",
    target_label: "Boardroom sports-culture editorial surface",
    crm_segment: "MEDIA_PLATFORM",
    relationship_state: "STALE",
    relationship_state_detail: "Old public/story-fit context exists, but no recent meaningful relationship interaction is evidenced.",
    warm_path: {
      introducer_name: null,
      path_detail: "No current warm path is known from fixture evidence.",
      evidence_state: "UNKNOWN"
    },
    last_meaningful_interaction: {
      happened_at: "2026-05-04T18:00:00.000Z",
      label: "Old story-fit note; too stale to justify timing.",
      freshness: "STALE",
      evidence_state: "STALE"
    },
    active_ask_or_commitment: {
      summary: null,
      evidence_state: "UNKNOWN"
    },
    why_relationship_matters: "Sports-culture media could amplify authority if the story is editorially useful and premium-safe.",
    cultural_power_map_context: {
      role: "AMPLIFIER",
      evidence_state: "INFERRED",
      detail: "Amplifier role is inferred from media context; editorial appetite is not known."
    },
    timing_window: {
      label: null,
      evidence_state: "STALE",
      rationale: "Timing should not be invented from stale context."
    },
    key_unknown_or_blocker: "Recent editorial appetite and warm path are UNKNOWN.",
    evidence_refs: ["boardroom-story-fit-old-note", "sports-culture-media-fit"],
    what_would_change_the_recommendation: [
      "A recent editorial theme matches Keegan's work.",
      "A current warm path is identified.",
      "Fresh relationship context replaces the stale note."
    ]
  },
  {
    target_id: "crm-brand-unknown-access-fanatics",
    target_label: "Fanatics premium sports-commerce collaboration",
    crm_segment: "BRAND_PARTNER",
    relationship_state: "UNKNOWN",
    relationship_state_detail: "Strategic relevance is plausible, but relationship access is not evidenced.",
    warm_path: {
      introducer_name: null,
      path_detail: "UNKNOWN access; no intro or response likelihood is asserted.",
      evidence_state: "UNKNOWN"
    },
    last_meaningful_interaction: {
      happened_at: null,
      label: "No meaningful interaction in supplied fixture evidence.",
      freshness: "UNKNOWN",
      evidence_state: "UNKNOWN"
    },
    active_ask_or_commitment: {
      summary: null,
      evidence_state: "UNKNOWN"
    },
    why_relationship_matters: "A premium-safe sports-commerce partner could matter only if mutual value and access become real.",
    cultural_power_map_context: {
      role: "DECISION_MAKER",
      evidence_state: "INFERRED",
      detail: "Decision-maker relevance is inferred from public context; access remains unknown."
    },
    timing_window: {
      label: null,
      evidence_state: "UNKNOWN",
      rationale: "No timing window is supported by evidence."
    },
    key_unknown_or_blocker: "Warm access, mutual value, and current need are UNKNOWN.",
    evidence_refs: ["fanatics-public-role", "sports-art-strategic-fit", "fanatics-unknown-gap"],
    what_would_change_the_recommendation: [
      "A real warm path is verified.",
      "A specific partnership owner is identified.",
      "Evidence shows current demand for premium sports-art storytelling."
    ]
  }
] satisfies RelationshipNextBestMoveTargetInputV1[];

export const RELATIONSHIP_NEXT_BEST_MOVE_TARGET_FIXTURES_V1: RelationshipNextBestMoveTargetInputV1[] = [
  ...RELATIONSHIP_NEXT_BEST_MOVE_TARGETS_UNSORTED_V1
].sort((a, b) => a.target_id.localeCompare(b.target_id));

export const RELATIONSHIP_NEXT_BEST_MOVE_VIEW_MODEL_FIXTURE_V1 = buildRelationshipNextBestMoveViewModelV1({
  targets: RELATIONSHIP_NEXT_BEST_MOVE_TARGET_FIXTURES_V1
});

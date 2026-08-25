import { resolveRelationshipNextStepAgingV1 } from "./adapter";
import type { RelationshipNextStepAgingInputV1 } from "./contracts";

export const RELATIONSHIP_NEXT_STEP_AGING_INPUT_FIXTURES_V1: RelationshipNextStepAgingInputV1[] = [
  {
    target_id: "aging-timely-collector-bridge",
    target_label: "Avery Morgan collector circle",
    crm_segment: "COLLECTOR",
    relationship_state: "KNOWN",
    relationship_state_detail: "Known private bridge; no outreach is performed.",
    warm_path: { introducer_name: "Avery Morgan", path_detail: "Known bridge for internal planning.", evidence_state: "KNOWN" },
    last_meaningful_interaction: { happened_at: "2026-08-23T17:00:00.000Z", label: "Fresh studio-context conversation.", freshness: "FRESH", evidence_state: "KNOWN" },
    active_ask_or_commitment: { summary: "Prepare internal value brief only.", evidence_state: "KNOWN" },
    why_relationship_matters: "High-trust collector bridge can protect scarcity and premium positioning.",
    cultural_power_map_context: { role: "BRIDGE", evidence_state: "INFERRED", detail: "Bridge role is inferred from relationship context." },
    timing_window: { label: "THIS_WEEK_INTERNAL_PREP", evidence_state: "KNOWN", rationale: "Fresh context supports internal prep only." },
    key_unknown_or_blocker: "Collector appetite remains unknown.",
    evidence_refs: ["crm-private-bridge-avery"],
    what_would_change_the_recommendation: ["Avery declines bridge role."],
    next_step: {
      label: "Draft collector-circle value brief",
      created_at: "2026-08-23T12:00:00.000Z",
      useful_window_days: 7,
      intentional_defer_until: null,
      defer_rationale: null
    },
    opportunity_importance: "HIGH"
  },
  {
    target_id: "aging-boardroom-editorial-window",
    target_label: "Boardroom sports-culture editorial surface",
    crm_segment: "MEDIA_PLATFORM",
    relationship_state: "INFERRED",
    relationship_state_detail: "Editorial fit is plausible, but current appetite needs refresh.",
    warm_path: { introducer_name: null, path_detail: "No current warm path is known.", evidence_state: "UNKNOWN" },
    last_meaningful_interaction: { happened_at: "2026-08-08T18:00:00.000Z", label: "Story-fit note from earlier planning.", freshness: "STALE", evidence_state: "STALE" },
    active_ask_or_commitment: { summary: null, evidence_state: "UNKNOWN" },
    why_relationship_matters: "Sports-culture media can amplify authority if the story is useful and premium-safe.",
    cultural_power_map_context: { role: "AMPLIFIER", evidence_state: "INFERRED", detail: "Amplifier role is inferred from public media context." },
    timing_window: { label: "THIS_MONTH_REVIEW", evidence_state: "INFERRED", rationale: "Internal review should happen before the story angle goes stale." },
    key_unknown_or_blocker: "Current editorial appetite is unknown.",
    evidence_refs: ["boardroom-story-fit-old-note"],
    what_would_change_the_recommendation: ["Fresh editorial theme match.", "Known internal champion."],
    next_step: {
      label: "Refresh Boardroom story-fit evidence",
      created_at: "2026-08-08T12:00:00.000Z",
      useful_window_days: 10,
      intentional_defer_until: null,
      defer_rationale: null
    },
    opportunity_importance: "HIGH"
  },
  {
    target_id: "aging-dormant-intentional-brand",
    target_label: "Fanatics premium collaboration surface",
    crm_segment: "BRAND_PARTNER",
    relationship_state: "UNKNOWN",
    relationship_state_detail: "Strategic relevance is plausible; relationship access is not evidenced.",
    warm_path: { introducer_name: null, path_detail: "No intro is known.", evidence_state: "UNKNOWN" },
    last_meaningful_interaction: { happened_at: "2026-07-01T18:00:00.000Z", label: "Old strategic-fit note.", freshness: "STALE", evidence_state: "STALE" },
    active_ask_or_commitment: { summary: "Hold until athlete-series proof is stronger.", evidence_state: "KNOWN" },
    why_relationship_matters: "A brand partner matters only if mutual value and access become real.",
    cultural_power_map_context: { role: "DECISION_MAKER", evidence_state: "INFERRED", detail: "Decision-maker relevance is inferred from public context." },
    timing_window: { label: "INTENTIONAL_HOLD", evidence_state: "STALE", rationale: "Hold is deliberate until better proof exists." },
    key_unknown_or_blocker: "Warm access and mutual value are unknown.",
    evidence_refs: ["fanatics-public-role"],
    what_would_change_the_recommendation: ["A verified partnership owner.", "Clear brand need."],
    next_step: {
      label: "Hold Fanatics brief until athlete-series proof improves",
      created_at: "2026-07-01T12:00:00.000Z",
      useful_window_days: 14,
      intentional_defer_until: "2026-09-15T12:00:00.000Z",
      defer_rationale: "Intentional defer protects premium positioning until stronger proof exists."
    },
    opportunity_importance: "MEDIUM"
  },
  {
    target_id: "aging-unknown-timing-cultural-bridge",
    target_label: "Unknown cultural bridge",
    crm_segment: "UNKNOWN",
    relationship_state: "UNKNOWN",
    relationship_state_detail: "No relationship state is evidenced.",
    warm_path: { introducer_name: null, path_detail: "UNKNOWN path.", evidence_state: "UNKNOWN" },
    last_meaningful_interaction: { happened_at: null, label: "No interaction evidence.", freshness: "UNKNOWN", evidence_state: "UNKNOWN" },
    active_ask_or_commitment: { summary: null, evidence_state: "UNKNOWN" },
    why_relationship_matters: "Could matter only if identity, access, and mutual value become known.",
    cultural_power_map_context: { role: "UNKNOWN", evidence_state: "UNKNOWN", detail: "No cultural-power role is evidenced." },
    timing_window: { label: null, evidence_state: "UNKNOWN", rationale: "No timing window is supported." },
    key_unknown_or_blocker: "Timing, access, and relationship value are UNKNOWN.",
    evidence_refs: ["unknown-cultural-bridge-gap"],
    what_would_change_the_recommendation: ["Verified identity.", "Known timing window."],
    next_step: {
      label: "Clarify whether a real bridge exists",
      created_at: null,
      useful_window_days: null,
      intentional_defer_until: null,
      defer_rationale: null
    },
    opportunity_importance: "UNKNOWN"
  }
];

export const RELATIONSHIP_NEXT_STEP_AGING_FIXTURES_V1 = RELATIONSHIP_NEXT_STEP_AGING_INPUT_FIXTURES_V1.map((input) =>
  resolveRelationshipNextStepAgingV1(input)
);

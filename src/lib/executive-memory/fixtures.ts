import {
  DECISION_PRECEDENT_VERSION_V1,
  type CurrentDecisionMemoryQueryV1,
  type DecisionPrecedentV1
} from "./contracts";

export const CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1: CurrentDecisionMemoryQueryV1 = {
  decision_id: "decision-private-collector-room",
  recommendation_id: "rec-private-collector-room-access-validation",
  context_tags: ["premium-positioning", "collector-access", "scarcity-safe", "private-validation"],
  option_tags: ["private-room-proof", "access-validation", "no-discount", "bounded-test"],
  evidence_refs: ["strategy-prepare-creative-direction", "trajectory-fixture-scouting", "project-economics-strategic-weak-direct"],
  key_assumptions: ["Warm access can be tested cheaply.", "Direct economics are unknown.", "Prestige value remains qualitative."]
};

const DECISION_PRECEDENTS_UNSORTED_V1: DecisionPrecedentV1[] = [
  {
    contract_version: DECISION_PRECEDENT_VERSION_V1,
    DECISION_ID: "precedent-private-preview-qualified-access-success",
    decided_at: "2026-07-12",
    decision_title: "Private preview before broader public signal",
    CONTEXT_TAGS: ["premium-positioning", "collector-access", "scarcity-safe", "private-validation"],
    OPTIONS_CONSIDERED: [
      {
        option_id: "private-room-proof",
        label: "Run a private preview with qualified access",
        was_chosen: true,
        tradeoff: "More controlled signal, less public attention."
      },
      {
        option_id: "public-drop",
        label: "Launch a broad public drop",
        was_chosen: false,
        tradeoff: "More visible but weaker scarcity discipline."
      }
    ],
    CHOSEN_ACTION: "Validated collector interest through a private preview before public campaign work.",
    KEY_EVIDENCE: [
      {
        evidence_id: "ev_first_party_collector_graphite",
        label: "First-party collector response",
        truth_state: "KNOWN",
        notes: "Qualified collector feedback favored scarce graphite-led work."
      },
      {
        evidence_id: "strategy-prepare-creative-direction",
        label: "Strategy premium-positioning fixture",
        truth_state: "INFERRED",
        notes: "Premium positioning favored private validation over public volume."
      }
    ],
    KEY_ASSUMPTIONS: ["Qualified access mattered more than public reach.", "Scarcity language would not be diluted."],
    OUTCOME: {
      status: "SUCCESSFUL",
      summary: "The private preview created useful buyer signal without discounting or public scarcity damage.",
      evidence_refs: ["ev_first_party_collector_graphite"]
    },
    ATTRIBUTION_CONFIDENCE: "HIGH",
    LESSON: "A bounded private validation can inform premium-positioning decisions when access quality is known.",
    PREFERENCE_SIGNAL_CLASS: "SUCCESSFUL_PATTERN"
  },
  {
    contract_version: DECISION_PRECEDENT_VERSION_V1,
    DECISION_ID: "precedent-public-volume-drop-failed",
    decided_at: "2026-06-20",
    decision_title: "Broad low-friction public volume push",
    CONTEXT_TAGS: ["public-attention", "volume", "discount-risk", "scarcity-risk"],
    OPTIONS_CONSIDERED: [
      {
        option_id: "public-drop",
        label: "Broad public drop",
        was_chosen: true,
        tradeoff: "Chased reach and volume while weakening scarcity."
      },
      {
        option_id: "private-room-proof",
        label: "Private collector-room proof",
        was_chosen: false,
        tradeoff: "Slower signal but better premium fit."
      }
    ],
    CHOSEN_ACTION: "Used broad public urgency language before access or scarcity boundaries were proven.",
    KEY_EVIDENCE: [
      {
        evidence_id: "ev_public_engagement_spike",
        label: "Public engagement spike",
        truth_state: "INFERRED",
        notes: "Engagement did not prove elite buyer intent."
      }
    ],
    KEY_ASSUMPTIONS: ["Broad public attention would translate into premium buyer intent."],
    OUTCOME: {
      status: "FAILED",
      summary: "Attention increased but did not create premium buyer signal and risked accessibility framing.",
      evidence_refs: ["ev_public_engagement_spike"]
    },
    ATTRIBUTION_CONFIDENCE: "MEDIUM",
    LESSON: "Public attention is not a substitute for premium access or verified buyer intent.",
    PREFERENCE_SIGNAL_CLASS: "FAILED_PATTERN"
  },
  {
    contract_version: DECISION_PRECEDENT_VERSION_V1,
    DECISION_ID: "precedent-studio-focus-superficial-match",
    decided_at: "2026-05-18",
    decision_title: "Reject event work to protect studio capacity",
    CONTEXT_TAGS: ["studio-capacity", "event-request", "time-protection", "premium-positioning"],
    OPTIONS_CONSIDERED: [
      {
        option_id: "reject-event",
        label: "Reject the event path",
        was_chosen: true,
        tradeoff: "Protected studio time while losing optional relationship signal."
      },
      {
        option_id: "access-validation",
        label: "Validate one access path",
        was_chosen: false,
        tradeoff: "Could have learned about access but created delivery pressure."
      }
    ],
    CHOSEN_ACTION: "Declined an event-adjacent request because it had fixed delivery pressure and no elite access proof.",
    KEY_EVIDENCE: [
      {
        evidence_id: "ev_capacity_conflict",
        label: "Studio capacity conflict",
        truth_state: "KNOWN",
        notes: "Capacity was already committed."
      }
    ],
    KEY_ASSUMPTIONS: ["The request would create delivery pressure.", "Access upside was not credible."],
    OUTCOME: {
      status: "SUCCESSFUL",
      summary: "Protected studio capacity, but the context differs from a bounded private access-validation step.",
      evidence_refs: ["ev_capacity_conflict"]
    },
    ATTRIBUTION_CONFIDENCE: "HIGH",
    LESSON: "Reject event work when it has fixed delivery pressure and no credible access route; do not overapply that lesson to bounded validation.",
    PREFERENCE_SIGNAL_CLASS: "CURRENT_CONTEXT_DIFFERENCE"
  },
  {
    contract_version: DECISION_PRECEDENT_VERSION_V1,
    DECISION_ID: "precedent-meta-adjustment-low-attribution",
    decided_at: "2026-08-12",
    decision_title: "Small paid-media adjustment with unresolved attribution",
    CONTEXT_TAGS: ["measurement", "paid-media", "attribution-conflict", "traffic-quality"],
    OPTIONS_CONSIDERED: [
      {
        option_id: "measurement-first",
        label: "Measurement-first review",
        was_chosen: false,
        tradeoff: "Slower but cleaner learning."
      },
      {
        option_id: "small-paid-adjustment",
        label: "Small paid adjustment",
        was_chosen: true,
        tradeoff: "Created ambiguous movement without defensible attribution."
      }
    ],
    CHOSEN_ACTION: "Made a small paid-media adjustment before attribution conflict was resolved.",
    KEY_EVIDENCE: [
      {
        evidence_id: "ev_meta_delivery_snapshot",
        label: "Meta delivery snapshot",
        truth_state: "CONFLICTED",
        notes: "Delivery moved, but purchase attribution conflicted with commerce-source evidence."
      }
    ],
    KEY_ASSUMPTIONS: ["Platform delivery could be interpreted against commerce outcomes."],
    OUTCOME: {
      status: "UNKNOWN",
      summary: "Outcome stayed UNKNOWN because attribution confidence was low.",
      evidence_refs: ["ev_meta_delivery_snapshot", "ev_woo_attribution_counterpoint"]
    },
    ATTRIBUTION_CONFIDENCE: "LOW",
    LESSON: "Low-attribution outcomes are weak signals only and cannot dominate current recommendations.",
    PREFERENCE_SIGNAL_CLASS: "WEAK_SIGNAL_ONLY"
  }
];

export const DECISION_PRECEDENT_FIXTURES_V1: DecisionPrecedentV1[] = [...DECISION_PRECEDENTS_UNSORTED_V1].sort((a, b) => (
  a.DECISION_ID.localeCompare(b.DECISION_ID)
));

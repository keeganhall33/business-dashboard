import type { IntelligenceRecommendationEvalInputV1, SyntheticBusinessEvidenceV1 } from "./contracts";

export const REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1: SyntheticBusinessEvidenceV1[] = [
  { id: "ev-strategy-premium-fit", domain: "STRATEGY", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "strategy fixture", claim: "Premium sports-cultural positioning fits current brand direction.", supports_recommendation: true, underlying_signal_id: "premium-fit" },
  { id: "ev-finance-margin-unknown", domain: "FINANCIAL", evidence_class: "UNKNOWN", truth_state: "UNKNOWN", source_label: "finance fixture", claim: "Project margin is UNKNOWN and must not be treated as zero cost.", supports_recommendation: false, underlying_signal_id: "margin-gap" },
  { id: "ev-relationship-warm-intro", domain: "RELATIONSHIPS", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "CRM fixture", claim: "Warm introduction exists for one credible host.", supports_recommendation: true, underlying_signal_id: "warm-host-route" },
  { id: "ev-capacity-tight-week", domain: "CAPACITY", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "project fixture", claim: "Studio capacity is tight this week.", supports_recommendation: true, underlying_signal_id: "capacity-tight" },
  { id: "ev-risk-rights-review", domain: "RISK", evidence_class: "INFERRED", truth_state: "INFERRED", source_label: "risk fixture", claim: "Public commercial use requires rights review before exposure.", supports_recommendation: true, underlying_signal_id: "rights-risk" },
  { id: "ev-rights-permission-unknown", domain: "RIGHTS", evidence_class: "UNKNOWN", truth_state: "UNKNOWN", source_label: "rights fixture", claim: "Rights permission is UNKNOWN.", supports_recommendation: false, underlying_signal_id: "rights-gap" },
  { id: "ev-market-signal-proxy", domain: "MARKET", evidence_class: "PROXY", truth_state: "INFERRED", source_label: "market fixture", claim: "Media attention is proxy demand only, not direct buyer intent.", supports_recommendation: true, underlying_signal_id: "media-attention" },
  { id: "ev-creative-proof-asset", domain: "CREATIVE", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "creative fixture", claim: "A proof-quality drawing asset exists for private review.", supports_recommendation: true, underlying_signal_id: "proof-asset" },
  { id: "ev-operations-no-send", domain: "OPERATIONS", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "ops fixture", claim: "No live outreach send is authorized.", supports_recommendation: true, underlying_signal_id: "no-send-gate" },
  { id: "ev-crm-collector-interest", domain: "CRM", evidence_class: "PROXY", truth_state: "INFERRED", source_label: "collector fixture", claim: "Collector saved related work; this is proxy interest.", supports_recommendation: true, underlying_signal_id: "collector-interest" },
  { id: "ev-events-host-window", domain: "EVENTS", evidence_class: "INFERRED", truth_state: "INFERRED", source_label: "event fixture", claim: "Host window may align with private preview timing.", supports_recommendation: true, underlying_signal_id: "event-window" },
  { id: "ev-collectors-no-direct-buyer", domain: "COLLECTORS", evidence_class: "UNKNOWN", truth_state: "UNKNOWN", source_label: "collector fixture", claim: "Direct buyer intent is UNKNOWN.", supports_recommendation: false, underlying_signal_id: "buyer-intent-gap" },
  { id: "ev-projects-deadline", domain: "PROJECTS", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "project fixture", claim: "Current project deadline limits speculative work.", supports_recommendation: true, underlying_signal_id: "deadline" },
  { id: "ev-orders-revenue-sparse", domain: "ORDERS_REVENUE", evidence_class: "DIRECT", truth_state: "STALE", source_label: "order fixture", claim: "Recent order evidence is stale.", supports_recommendation: false, underlying_signal_id: "orders-stale" },
  { id: "ev-marketing-media-noise", domain: "MARKETING_MEDIA", evidence_class: "PROXY", truth_state: "INFERRED", source_label: "media fixture", claim: "Multiple posts reflect one media attention signal.", supports_recommendation: true, underlying_signal_id: "media-attention" },
  { id: "ev-partnership-fit", domain: "PARTNERSHIPS", evidence_class: "INFERRED", truth_state: "INFERRED", source_label: "partnership fixture", claim: "Potential partner has brand fit but no commercial terms.", supports_recommendation: true, underlying_signal_id: "partner-fit" },
  { id: "ev-memory-email-correction", domain: "MEMORY_EMAIL_STYLE", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "memory/email-style fixture", claim: "Human-reported correction confirms host intro.", supports_recommendation: true, underlying_signal_id: "warm-host-route" },
  { id: "ev-outcome-learning-prior", domain: "OUTCOME_LEARNING", evidence_class: "DIRECT", truth_state: "KNOWN", source_label: "learning fixture", claim: "Prior weak-attribution campaign did not justify a full commitment.", supports_recommendation: true, underlying_signal_id: "weak-attribution-prior" }
];

export const INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1: IntelligenceRecommendationEvalInputV1 = {
  recommendation_id: "quality-eval-private-preview-validation",
  title: "Validate private preview before any public commitment",
  current_action: "Validate one warm host route and rights boundary before external commitment.",
  priority_rank: 1,
  evidence_refs: REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1.map((item) => item.id),
  evidence: REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1,
  uncertainty_notes: ["Direct buyer intent remains UNKNOWN.", "Rights permission remains UNKNOWN.", "Margin remains UNKNOWN."],
  downside: "Public commitment before rights and buyer evidence could create reputational and legal downside.",
  opportunity_cost: "Uses studio attention that could otherwise finish a current premium piece.",
  strongest_case_against: "The warm host route may not translate into buyer access or purchase intent.",
  duplicates_underlying_signal_ids: [],
  revision: {
    previous_action: "Preserve option and research host access.",
    new_action: "Validate one warm host route and rights boundary before external commitment.",
    new_evidence_refs: ["ev-memory-email-correction"],
    preserved_prior_rationale: ["Premium fit was real, but access-path unknown previously capped action."],
    history_versions: [1, 2]
  }
};

export const INTELLIGENCE_QUALITY_BAD_FIXTURE_V1: IntelligenceRecommendationEvalInputV1 = {
  ...INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1,
  recommendation_id: "quality-eval-known-bad-regression",
  title: "Known bad inflated public launch recommendation",
  current_action: "Launch publicly now.",
  priority_rank: null,
  evidence_refs: ["ev-bad-proxy-as-direct", "ev-marketing-media-noise", "ev-bad-unknown-as-support", "missing-evidence"],
  evidence: [
    ...REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1,
    {
      id: "ev-bad-proxy-as-direct",
      domain: "MARKET",
      evidence_class: "PROXY",
      truth_state: "INFERRED",
      source_label: "bad regression fixture",
      claim: "Proxy media attention proves direct buyer intent.",
      supports_recommendation: true,
      underlying_signal_id: "media-attention"
    },
    {
      id: "ev-bad-unknown-as-support",
      domain: "FINANCIAL",
      evidence_class: "UNKNOWN",
      truth_state: "UNKNOWN",
      source_label: "bad regression fixture",
      claim: "UNKNOWN margin is treated as safe enough for public launch.",
      supports_recommendation: true,
      underlying_signal_id: "margin-gap"
    }
  ],
  uncertainty_notes: [],
  downside: null,
  opportunity_cost: null,
  strongest_case_against: null,
  duplicates_underlying_signal_ids: ["media-attention"],
  revision: {
    previous_action: "Launch publicly now.",
    new_action: "Launch publicly now.",
    new_evidence_refs: [],
    preserved_prior_rationale: [],
    history_versions: [2]
  }
};

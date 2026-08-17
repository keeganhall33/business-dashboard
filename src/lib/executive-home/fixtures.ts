export type IntelligenceStateV1 = "FACT" | "INFERENCE" | "HYPOTHESIS" | "RECOMMENDATION" | "ACTION" | "WARNING" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type IntelligencePriorityV1 = "DO_NOW" | "PREPARE" | "MONITOR";
export type ConfidenceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type ApprovalStateV1 = "NONE" | "KEEGAN_ACTION_REQUIRED" | "APPROVED" | "BLOCKED";
export type FreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";
export type SpecialistDomainV1 = "STRATEGY" | "FINANCIAL" | "CREATIVE" | "OPERATIONS" | "EVIDENCE" | "LEARNING";

export type ExecutiveIntelligenceCardV1 = {
  id: string;
  section:
    | "WHAT_MATTERS_NOW"
    | "WHAT_CHANGED"
    | "DO_NOW_PREPARE_MONITOR"
    | "KEEGAN_ACTION_REQUIRED"
    | "TOP_OPPORTUNITIES"
    | "CURRENT_HYPOTHESES_EXPERIMENTS"
    | "LEARNING_SINCE_LAST_REVIEW"
    | "DATA_COVERAGE_GAPS";
  title: string;
  summary: string;
  state: IntelligenceStateV1;
  priority: IntelligencePriorityV1;
  confidence: ConfidenceV1;
  approval_state: ApprovalStateV1;
  freshness: FreshnessV1;
  specialist_domain: SpecialistDomainV1;
  why: string;
  evidence: string[];
  next_action: string;
};

export type ExecutiveHomeFixtureV1 = {
  generated_at: string;
  hero: {
    title: string;
    summary: string;
  };
  cards: ExecutiveIntelligenceCardV1[];
  empty_state: string;
  loading_state: string;
  error_state: string;
};

export const EXECUTIVE_HOME_FIXTURE_V1: ExecutiveHomeFixtureV1 = {
  generated_at: "2026-08-17T00:00:00.000Z",
  hero: {
    title: "Executive Home",
    summary: "A light-first command surface for the few intelligence changes that matter now."
  },
  empty_state: "No material intelligence changes need attention right now.",
  loading_state: "Loading executive intelligence with provenance intact.",
  error_state: "Unable to verify executive intelligence. Do not treat unavailable data as zero.",
  cards: [
    {
      id: "matters-now-premium-scarcity",
      section: "WHAT_MATTERS_NOW",
      title: "Protect premium scarcity while choosing the next move",
      summary: "The strongest immediate lever is a narrow, high-prestige creative decision rather than a broad volume push.",
      state: "RECOMMENDATION",
      priority: "DO_NOW",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "STRATEGY",
      why: "This keeps Home focused on the highest-value strategic decision instead of a wall of metrics.",
      evidence: ["Strategy fixture: premium positioning priority", "Creative fixture: graphite path confidence is rising"],
      next_action: "Open the Decision Room for the next artwork/series choice."
    },
    {
      id: "changed-creative-direction",
      section: "WHAT_CHANGED",
      title: "Creative direction confidence changed",
      summary: "Graphite moved from KEEP_NOW toward DEVELOP_NEXT after material collector and institutional signals.",
      state: "FACT",
      priority: "PREPARE",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "CREATIVE",
      why: "Material evidence changed confidence; routine scans remain silent.",
      evidence: ["Creative Direction fixture: RecommendationVersion 2", "Evidence fixture: material first-party and institutional signals"],
      next_action: "Review the before/after recommendation version history."
    },
    {
      id: "triage-private-collector-room",
      section: "DO_NOW_PREPARE_MONITOR",
      title: "Validate one warm collector-room access path",
      summary: "Do the smallest validation step before building a full prestige-event concept.",
      state: "ACTION",
      priority: "DO_NOW",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "STRATEGY",
      why: "It buys option value without committing public positioning or budget.",
      evidence: ["Decision Room fixture: access path is biggest bottleneck"],
      next_action: "Ask: who can credibly get this into the right room?"
    },
    {
      id: "keegan-action-required-none",
      section: "KEEGAN_ACTION_REQUIRED",
      title: "No Keegan approval required in this fixture",
      summary: "No outreach, purchases, pricing, publishing, or production commitments are queued.",
      state: "FACT",
      priority: "MONITOR",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "OPERATIONS",
      why: "Executive Home should distinguish actual required action from passive awareness.",
      evidence: ["Safety fixture: read-only recommendation surfaces only"],
      next_action: "Keep monitoring for approval-gated actions."
    },
    {
      id: "top-opportunity-elite-network",
      section: "TOP_OPPORTUNITIES",
      title: "Elite network optionality is the highest-upside opportunity",
      summary: "Prestige/network upside is high, but direct economics remain UNKNOWN.",
      state: "INFERENCE",
      priority: "PREPARE",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "FINANCIAL",
      why: "The surface keeps qualitative strategic value separate from dollar estimates.",
      evidence: ["Strategic Advantage fixture: prestige network optionality", "Financial fixture: direct economics UNKNOWN"],
      next_action: "Validate access before treating it as a financial opportunity."
    },
    {
      id: "hypothesis-graphite-shortest-path",
      section: "CURRENT_HYPOTHESES_EXPERIMENTS",
      title: "Graphite remains the shortest prestige path",
      summary: "Hypothesis is stronger, but still tested through collector response and institutional-fit evidence.",
      state: "HYPOTHESIS",
      priority: "MONITOR",
      confidence: "MEDIUM",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "LEARNING",
      why: "Hypotheses should not be rendered as facts.",
      evidence: ["Learning fixture: material evidence increased but did not remove uncertainty"],
      next_action: "Track one focused experiment instead of multiplying media."
    },
    {
      id: "learning-noise-control",
      section: "LEARNING_SINCE_LAST_REVIEW",
      title: "Noise control prevented recommendation churn",
      summary: "A non-material market article did not change the creative recommendation.",
      state: "FACT",
      priority: "MONITOR",
      confidence: "HIGH",
      approval_state: "NONE",
      freshness: "FRESH",
      specialist_domain: "LEARNING",
      why: "This preserves trust: new information is not the same as material evidence.",
      evidence: ["Creative Direction fixture: noisy evidence produced no version change"],
      next_action: "Keep routine scans silent unless materiality changes."
    },
    {
      id: "coverage-gap-unknown-direct-economics",
      section: "DATA_COVERAGE_GAPS",
      title: "Direct economics for prestige event concepts remain UNKNOWN",
      summary: "Do not convert prestige or network value into dollars until direct evidence exists.",
      state: "UNKNOWN",
      priority: "PREPARE",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "EVIDENCE",
      why: "UNKNOWN must stay visually distinct from zero, stale, or healthy.",
      evidence: ["Financial/Strategic fixtures: direct economics missing"],
      next_action: "Collect minimum cost, buyer access, and timing facts."
    }
  ]
};

export function cardsBySection(section: ExecutiveIntelligenceCardV1["section"]) {
  return EXECUTIVE_HOME_FIXTURE_V1.cards.filter((card) => card.section === section);
}

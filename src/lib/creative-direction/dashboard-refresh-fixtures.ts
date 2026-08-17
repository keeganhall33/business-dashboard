export type CreativeStageV1 = "KEEP_NOW" | "TEST_NOW" | "DEVELOP_NEXT" | "DEFER" | "AVOID";
export type RefreshCadenceV1 = "EVENT_TRIGGERED" | "WEEKLY_LIGHTWEIGHT_SCAN" | "MONTHLY_FORMAL_REVIEW" | "QUARTERLY_STRATEGY_RESET";
export type SignalClassV1 = "MARKET" | "INSTITUTIONAL" | "COLLECTOR" | "PEER_CATEGORY" | "FIRST_PARTY" | "CULTURAL" | "DIGITAL" | "MEDIUM_STYLE";
export type MaterialityV1 = "NOISE" | "LOW" | "MATERIAL" | "MAJOR";
export type DemandHorizonV1 = "CURRENT_DEMAND" | "LONG_TERM_PRESTIGE" | "ART_HISTORICAL_SIGNIFICANCE";

export type CreativeEvidenceV1 = {
  id: string;
  signal_class: SignalClassV1;
  horizon: DemandHorizonV1;
  materiality: MaterialityV1;
  source: string;
  summary: string;
  provenance: string[];
};

export type CreativeRecommendationVersionV1 = {
  version: number;
  stage: CreativeStageV1;
  recommendation: string;
  what_should_i_make_next: string;
  medium_portfolio: string[];
  artwork_series_recommendations: string[];
  composition_palette_scale_material_style: string[];
  short_path_to_goal: string;
  what_to_stop_avoid: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  assumptions: string[];
  why_changed: string | null;
  new_evidence_ids: string[];
  changed_assumptions: string[];
};

export type CreativeRefreshStateV1 = {
  cadence: RefreshCadenceV1;
  status: "DUE" | "CURRENT" | "SILENT_NO_MATERIAL_CHANGE";
  trigger: string;
  monitored_signal_classes: SignalClassV1[];
  last_checked: string;
};

export type CreativeDirectionWorkspaceFixtureV1 = {
  generated_at: string;
  current_recommendation: CreativeRecommendationVersionV1;
  version_history: CreativeRecommendationVersionV1[];
  refresh_states: CreativeRefreshStateV1[];
  evidence: CreativeEvidenceV1[];
  market_signals: string[];
  institutional_signals: string[];
  collector_signals: string[];
  peer_category_map: string[];
  open_visual_territory: string[];
  creative_experiments: string[];
  creative_learnings: string[];
  executive_home_deltas: string[];
};

export const CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1: CreativeDirectionWorkspaceFixtureV1 = {
  generated_at: "2026-08-17T00:00:00.000Z",
  evidence: [
    { id: "ev-first-party-collector-graphite", signal_class: "FIRST_PARTY", horizon: "CURRENT_DEMAND", materiality: "MATERIAL", source: "studio_fixture", summary: "Collector response favors ambitious graphite originals with sports/cultural iconography.", provenance: ["fixture:first-party-interest"] },
    { id: "ev-institutional-drawing-validation", signal_class: "INSTITUTIONAL", horizon: "LONG_TERM_PRESTIGE", materiality: "MATERIAL", source: "institutional_fixture", summary: "Institutional signal supports works on paper when scale, subject, and craft authority are distinctive.", provenance: ["fixture:institutional-signal"] },
    { id: "ev-noisy-article", signal_class: "MARKET", horizon: "CURRENT_DEMAND", materiality: "NOISE", source: "market_fixture", summary: "Single article mentions a broad figurative trend without changing fit or confidence.", provenance: ["fixture:noise"] }
  ],
  version_history: [
    { version: 1, stage: "KEEP_NOW", recommendation: "Keep graphite as the core medium and avoid premature medium sprawl.", what_should_i_make_next: "A museum-level graphite original anchored in iconic sports culture.", medium_portfolio: ["Graphite originals: primary", "Prints: tightly controlled support", "Sculpture: defer"], artwork_series_recommendations: ["Iconic athlete portrait study"], composition_palette_scale_material_style: ["Monochrome graphite", "Tight cinematic crop", "Larger-than-prior scale", "Archival paper"], short_path_to_goal: "Build authority through unmistakable graphite mastery before expanding medium.", what_to_stop_avoid: ["Do not chase sculpture now", "Avoid trend-led color experiments"], confidence: "MEDIUM", assumptions: ["Graphite remains the strongest proof of craft authority."], why_changed: null, new_evidence_ids: [], changed_assumptions: [] },
    { version: 2, stage: "DEVELOP_NEXT", recommendation: "Develop the next graphite original as a cinematic sports-culture series seed with institutional scale cues.", what_should_i_make_next: "A large graphite work around an iconic athlete or culturally durable sports moment, composed for museum-level presence.", medium_portfolio: ["Graphite originals: primary and accelerated", "Selective studies: test collector response", "Sculpture: defer until access/capacity changes"], artwork_series_recommendations: ["Iconic sports-culture originals", "Collector-facing graphite studies", "Institutional-scale drawing language"], composition_palette_scale_material_style: ["Monochrome graphite with expanded negative space", "More deliberate scale", "Archival material emphasis", "Cinematic composition with cultural context"], short_path_to_goal: "Use graphite as the shortest prestige path while testing only low-risk visual expansions.", what_to_stop_avoid: ["Avoid broad style pivots", "Do not start sculpture production", "Ignore non-material trend articles"], confidence: "HIGH", assumptions: ["Institutional validation and first-party collector response materially strengthen graphite direction."], why_changed: "Material first-party collector and institutional signals increased confidence and moved the recommendation from KEEP_NOW to DEVELOP_NEXT.", new_evidence_ids: ["ev-first-party-collector-graphite", "ev-institutional-drawing-validation"], changed_assumptions: ["Graphite is not only current strength; it is also the strongest near-term institutional/prestige path."] }
  ],
  current_recommendation: {} as CreativeRecommendationVersionV1,
  refresh_states: [
    { cadence: "EVENT_TRIGGERED", status: "CURRENT", trigger: "Material first-party or institutional signal", monitored_signal_classes: ["FIRST_PARTY", "INSTITUTIONAL", "MARKET", "COLLECTOR", "PEER_CATEGORY", "CULTURAL", "DIGITAL", "MEDIUM_STYLE"], last_checked: "2026-08-17" },
    { cadence: "WEEKLY_LIGHTWEIGHT_SCAN", status: "SILENT_NO_MATERIAL_CHANGE", trigger: "Weekly market/collector/institutional/peer scan", monitored_signal_classes: ["MARKET", "COLLECTOR", "INSTITUTIONAL", "PEER_CATEGORY"], last_checked: "2026-08-17" },
    { cadence: "MONTHLY_FORMAL_REVIEW", status: "DUE", trigger: "Medium mix, subjects, visual language, price/collector fit, experiments, trajectory", monitored_signal_classes: ["MARKET", "INSTITUTIONAL", "COLLECTOR", "FIRST_PARTY", "MEDIUM_STYLE"], last_checked: "2026-08-01" },
    { cadence: "QUARTERLY_STRATEGY_RESET", status: "CURRENT", trigger: "Market evidence, historical context, first-party outcomes, long-term goal fit", monitored_signal_classes: ["MARKET", "INSTITUTIONAL", "COLLECTOR", "PEER_CATEGORY", "CULTURAL", "FIRST_PARTY"], last_checked: "2026-07-01" }
  ],
  market_signals: ["Separate current demand from long-term prestige before changing medium mix."],
  institutional_signals: ["Works on paper can carry prestige when scale and craft authority are exceptional."],
  collector_signals: ["First-party collector response supports ambitious graphite originals."],
  peer_category_map: ["Peer movement is monitored, but no single peer sale changes the recommendation."],
  open_visual_territory: ["Large-scale graphite sports-culture originals with cinematic restraint."],
  creative_experiments: ["Test one collector-facing graphite study before committing to a full series expansion."],
  creative_learnings: ["Noise does not revise recommendations; material evidence changes confidence and version history."],
  executive_home_deltas: ["Creative Direction changed: graphite moved from KEEP_NOW to DEVELOP_NEXT because material collector/institutional evidence increased confidence."]
};

CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1.current_recommendation = CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1.version_history[1];

export function shouldCreateCreativeRecommendationRevision(evidence: CreativeEvidenceV1[]): boolean {
  return evidence.some((item) => item.materiality === "MATERIAL" || item.materiality === "MAJOR");
}

export function createNextCreativeRecommendationVersion(input: {
  previous: CreativeRecommendationVersionV1;
  evidence: CreativeEvidenceV1[];
}): CreativeRecommendationVersionV1 | null {
  const material = input.evidence.filter((item) => item.materiality === "MATERIAL" || item.materiality === "MAJOR");
  if (material.length === 0) return null;
  return {
    ...input.previous,
    version: input.previous.version + 1,
    confidence: "HIGH",
    stage: input.previous.stage === "KEEP_NOW" ? "DEVELOP_NEXT" : input.previous.stage,
    why_changed: "Material evidence changed confidence, assumptions, and the next artwork decision.",
    new_evidence_ids: material.map((item) => item.id).sort(),
    changed_assumptions: ["Material evidence must update the recommendation visibly, not mutate it invisibly."]
  };
}

export function executiveHomeCreativeDeltas(fixture: CreativeDirectionWorkspaceFixtureV1): string[] {
  return shouldCreateCreativeRecommendationRevision(fixture.evidence) ? fixture.executive_home_deltas : [];
}

export type CreativeDirectionStage = "KEEP_NOW" | "TEST_NOW" | "DEVELOP_NEXT" | "DEFER" | "AVOID";

export type EvidenceSignalClass =
  | "CURRENT_DEMAND"
  | "LONG_TERM_PRESTIGE"
  | "COLLECTOR_BEHAVIOR"
  | "INSTITUTIONAL"
  | "PEER_CATEGORY"
  | "DIRECT_ARTIST"
  | "CULTURAL_TECH"
  | "RIGHTS_REFERENCE";

export type EvidenceReference = {
  evidenceId: string;
  title: string;
  publisher: string;
  sourceType: "MARKET_REPORT" | "AUCTION_RESEARCH" | "INSTITUTIONAL_RECORD" | "FIRST_PARTY" | "CATEGORY_RESEARCH";
  observedAt: string;
  signalClass: EvidenceSignalClass;
  claimSummary: string;
  provenance: {
    citationLabel: string;
    url: string | null;
    collectionMethod: "FIXTURE_BASELINE" | "FIRST_PARTY_FIXTURE";
  };
};

export type CreativeDirectionCandidate = {
  DIRECTION_ID: string;
  MEDIUM: string;
  MATERIALS: string[];
  SIZE_SCALE: string;
  SUBJECT_OR_NON_SUBJECT: string;
  COMPOSITION: string;
  PALETTE_COLOR_LOGIC: string;
  LIGHTING: string;
  DETAIL_EDGE_TREATMENT: string;
  NEGATIVE_SPACE: string;
  FIGURATION_ABSTRACTION_SURREAL_HYBRID: string;
  PHYSICAL_DEPTH_OR_RELIEF: string;
  SERIES_STRUCTURE: string;
  DISPLAY_INSTALLATION: string;
  TARGET_COLLECTOR_OR_INSTITUTION: string;
  CURRENT_MARKET_SIGNAL: string;
  LONG_TERM_PRESTIGE_SIGNAL: string;
  DIFFERENTIATION: string;
  KEEGAN_BRAND_FIT: string;
  LEARNING_CURVE: string;
  CAPACITY_COST: string;
  PRICE_CEILING_OR_ECONOMIC_NOTES: string;
  RIGHTS_REFERENCE_CONSTRAINTS: string;
  SHORT_PATH_VALUE: string;
  COMPOUNDING_ASSET_VALUE: string;
  BRAND_CONFUSION_RISK: string;
  CONFIDENCE: "HIGH" | "MEDIUM" | "LOW";
  CRITICAL_UNKNOWNS: string[];
  SUCCESS_CRITERIA: string[];
  WHAT_WOULD_CHANGE_THE_RECOMMENDATION: string[];
  STAGE: CreativeDirectionStage;
  evidenceIds: string[];
  decisionNotes: string[];
};

export type CreativeDirectionRoadmap = {
  generatedAt: string;
  dataMode: "FIXTURE_BASELINE";
  evidence: EvidenceReference[];
  directions: CreativeDirectionCandidate[];
  stageOrder: CreativeDirectionStage[];
  dashboard: {
    question: "WHAT SHOULD I MAKE NEXT?";
    currentRecommendation: string;
    mediumRoadmap: Array<{
      stage: CreativeDirectionStage;
      directionIds: string[];
      label: string;
    }>;
    caveats: string[];
  };
};

export type EvidenceUpdate = {
  evidenceId: string;
  directionId: string;
  materiality: "MATERIAL" | "NOISY" | "MISSING_REQUIRED";
  signalClass: EvidenceSignalClass;
  claimSummary: string;
};

import type { AgentKey, OpportunityStatus, OpportunityType } from "@/lib/types/requests";

export type DiscoverySourceLayer =
  | "first_party_active"
  | "first_party_unresolved"
  | "relationship_context"
  | "external_candidates"
  | "external_claim_signal";

export type ExternalClaimSignal = {
  claimId: string;
  contentHash: string;
  predicate: string;
  subjectLabel: string;
  objectLabel: string;
  createdAtIso?: string | null;
  evidenceUrls?: string[];
};

export type OpportunityArchetype =
  | "SPORTS_EVENT_ACTIVATION"
  | "VIP_RELATIONSHIP_GIFTING"
  | "CORPORATE_GIFTING_RELATIONSHIP_ART"
  | "CHARITY_TALENT_CAMPAIGN"
  | "CORPORATE_MILESTONE_ART"
  | "HALL_OF_FAME_RECURRING_PROGRAM"
  | "CORPORATE_COLLECTION_WORKPLACE_ART"
  | "HOSPITALITY_ART"
  | "LICENSING_MERCHANDISING"
  | "RETAIL_DISTRIBUTION"
  | "CULTURAL_INSTITUTIONAL";

export type EvidenceRef = {
  kind: "url" | "db_row" | "note";
  ref: string;
  label?: string;
};

export type ClaimRecord = {
  id: string;
  text: string;
  evidence: EvidenceRef[];
  createdAtIso?: string;
};

export type DomainArtifact = {
  kind: "event" | "program_surface" | "relationship" | "organization" | "other";
  label: string;
  refs?: EvidenceRef[];
};

export type OpportunitySeed = {
  layer: DiscoverySourceLayer;
  seedId: string;
  name: string;
  organization?: string | null;
  sourceSummary?: string | null;
  evidence: EvidenceRef[];
  claims: ClaimRecord[];
  artifacts: DomainArtifact[];
  linkedPipelineOpportunityId?: string | null;
};

export type OpportunityPipelineRow = {
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: OpportunityType | string;
  status: OpportunityStatus | string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: AgentKey | string;
  contact_name?: string | null;
  contact_role?: string | null;
  next_step: string | null;
  next_step_due_at: string | null;
  notes_md?: string | null;
  source?: string | null;
  natural_key?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CollectorRelationshipRow = {
  id: string;
  collector_name: string;
  tier: "A" | "B" | "C" | "Unrated" | string;
  estimated_value: number | null;
  next_move?: string | null;
  next_move_due_at?: string | null;
  notes?: string | null;
};

export type FactorId =
  | "PROJECT_MODEL_FIT"
  | "COMMERCIAL_SCALE"
  | "ACCESS"
  | "TIMING"
  | "PRESTIGE"
  | "REPEATABILITY"
  | "DIFFERENTIATION"
  | "EVIDENCE_STRENGTH"
  | "BUYER_INTENT_SIGNAL"
  | "STRATEGIC_UPSIDE"
  | "EXECUTION_FIT";

export type ScoredFactor = {
  id: FactorId;
  value: number | null;
  assumedWhenUnknown: number;
  weight: number;
  known: boolean;
  notes: string[];
};

export type ValuationRange = {
  low: number;
  base: number;
  high: number;
  currency: "USD";
  confidence: number; // 0..1
  drivers: string[];
  assumptions: string[];
  missingFacts: string[];
};

export type DecisionRecommendation = "ADVANCE_NOW" | "RESEARCH" | "HOLD_AND_MONITOR" | "DROP";

export type HoldTrigger = {
  trigger: string;
  why: string;
};

export type ResearchQuestion = {
  key: string;
  question: string;
  importance: "critical" | "high" | "medium" | "low";
  expectedInfoGain: "high" | "medium" | "low";
  resolvable: "likely" | "maybe" | "unlikely";
  wouldChangeDecision: boolean;
};

export type OpportunityCandidateV2 = {
  dedupeKey: string;
  seed: OpportunitySeed;
  pipeline?: OpportunityPipelineRow | null;

  archetypes: OpportunityArchetype[];
  bestArchetype: OpportunityArchetype | null;

  factors: ScoredFactor[];
  overallScore: number; // 0..100
  scoreNotes: string[];
  biggestUncertainty: string;

  valuation: ValuationRange;
  recommendation: DecisionRecommendation;
  holdTriggers: HoldTrigger[];
  nextResearchQuestions: ResearchQuestion[];
};

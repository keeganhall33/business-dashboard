import type { OpportunityArchetype } from "@/lib/opportunity-discovery-v2/types";

export type CoverageState = "KNOWN" | "PARTIAL" | "UNKNOWN" | "CONFLICTED" | "NOT_APPLICABLE";

export type ArtifactRef = {
  target_type: "claim_version" | "event_version" | "signal_version" | "evidence_reference_version" | "entity";
  target_id: string;
  target_content_hash?: string | null;
  role: string;
  confidence?: number | null;
};

export type CoverageVariableKey =
  | "IDENTITY_COVERAGE"
  | "ORGANIZATION_CONTEXT"
  | "TRIGGER_CONTEXT"
  | "PROGRAM_SURFACES"
  | "PROJECT_MODEL_INPUTS"
  | "COMMERCIAL_CONTEXT"
  | "TIMING_CONTEXT"
  | "ACCESS_CONTEXT"
  | "BUYER_INTENT"
  | "VALUATION_INPUTS"
  | "CONTACT_COVERAGE";

export type CoverageVariable = {
  key: CoverageVariableKey;
  state: CoverageState;
  notes: string[];
  supportingArtifacts: ArtifactRef[];
};

export type OpportunityCoverageProfile = {
  opportunity_id: string;
  opportunity_name: string;
  organization: string | null;
  plausible_archetypes: OpportunityArchetype[];
  variables: CoverageVariable[];
  summaryCounts: Record<CoverageState, number>;
};

export type ResearchQuestion = {
  question_id: string;
  opportunity_id: string;
  variable: CoverageVariableKey;

  research_subject_type: "OPPORTUNITY" | "TARGET_ORGANIZATION" | "POTENTIAL_BUYER";
  research_subject_id: string | null;
  research_subject_name: string;
  research_subject_confidence: number; // 0..1

  question: string;
  why_it_matters: string;
  current_state: CoverageState;
  expected_decision_impact: number; // 0..100
  expected_valuation_impact: number; // 0..100
  source_priority: string[];
  stopping_condition: string;
  dependencies: string[];
  effort_class: "low" | "medium" | "high";
  priority_score: number; // 0..100
  priority_explanation: string;
};

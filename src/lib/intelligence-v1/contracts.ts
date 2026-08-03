import type { TelemetrySource } from "@/lib/types/dashboard";
import type { ExplanationConfidence } from "@/lib/intelligence/explanation-contract";
import type { Opportunity, Recommendation } from "@/lib/intelligence/recommendation-contract";

export type WindowType = "daily_bucket" | "selected_range_snapshot" | "rolling_snapshot";

export type Unit = "usd" | "count" | "percent" | "ratio" | "unknown";

export type FreshnessState = "fresh" | "stale" | "unknown" | "unavailable";
export type CoverageState = "complete" | "partial" | "unknown" | "unavailable";
export type AttributionDefensible = "defensible" | "not_defensible" | "not_applicable";
export type ConfidenceState = "trusted" | "caveated" | "insufficient" | "conflicting" | "unavailable";

export type Confidence = {
  level: ExplanationConfidence;
  score: number | null; // 0-1
  reasons: string[];
  blockers: string[];
};

export type FactRef = {
  metric_id: string;
  value: number | null;
  unit: Unit;
  business_date?: string | null; // YYYY-MM-DD when daily
  window: {
    start_ts: string | null;
    end_ts: string | null;
    timezone: string;
    window_type: WindowType;
  };
  dimensions: Record<string, unknown>;
  provenance: {
    source_system: TelemetrySource | "meta" | "social" | "internal" | "unknown";
    source_run_id: string | null;
    snapshot_id: string | null;
    retrieved_at: string | null;
    source_as_of: string | null;
  };
  data_quality: {
    freshness_state: FreshnessState | null;
    coverage_state: CoverageState | null;
    attribution_defensible: AttributionDefensible | null;
    confidence_state: ConfidenceState | null;
  };
  metric_definition_version: string;
};

export type EvidenceEdge = {
  from_type: "finding" | "hypothesis" | "opportunity" | "recommendation";
  from_id: string;
  to_type: "fact" | "finding" | "hypothesis";
  to_id: string;
  relation: "supports" | "contradicts" | "depends_on" | "derived_from" | "tests";
  weight: number; // 0-1
  note: string | null;
};

export type Finding = {
  finding_id: string;
  detector_id: string;
  engine_version: string;
  type: "relationship" | "anomaly" | "data_gap";
  title: string;
  summary: string;
  window: { timezone: string; current: { startDate: string; endDate: string }; comparison: { startDate: string; endDate: string } };
  materiality_score: number;
  false_positive_guards: Array<{ guard: string; passed: boolean; detail?: string | null }>;
  facts_primary: FactRef[];
  evidence_for: FactRef[];
  evidence_against: FactRef[];
  missing_evidence: string[];
  confidence: Confidence;
  created_at: string;
};

export type Hypothesis = {
  hypothesis_id: string;
  finding_id: string;
  engine_version: string;
  statement: string;
  mechanism: string;
  predictions: Array<{ metric_id: string; expected_direction: "up" | "down" | "flat"; lag_days: number | null; note: string }>;
  disambiguation_test: { test_id: string; description: string; success_metric_id: string; evaluation_window_days: number };
  evidence_for: FactRef[];
  evidence_against: FactRef[];
  missing_evidence: string[];
  confidence: Confidence;
  created_at: string;
};

export type IntelligenceOpportunity = Opportunity;
export type IntelligenceRecommendation = Recommendation;

export type TrafficQualityMismatchResult = {
  ok: boolean;
  generatedAt: string;
  finding: Finding | null;
  hypotheses: Hypothesis[];
  opportunity: IntelligenceOpportunity | null;
  recommendation: IntelligenceRecommendation | null;
  evidence_edges: EvidenceEdge[];
  warnings: string[];
};

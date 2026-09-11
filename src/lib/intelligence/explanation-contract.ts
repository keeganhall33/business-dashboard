import type { TelemetrySource } from "@/lib/types/dashboard";

export type ExplanationConfidence =
  | "confirmed"
  | "strongly_supported"
  | "likely"
  | "possible"
  | "insufficient_evidence";

export type ExplanationEvidenceItem = {
  id: string;
  label: string;
  source: TelemetrySource | "supabase" | "internal" | "unknown";
  kind: "metric" | "timeseries" | "event" | "query";
  details: Record<string, unknown>;
};

export type ExplanationDriver = {
  id: string;
  label: string;
  direction: "up" | "down" | "flat";
  magnitude: "minor" | "moderate" | "major";
  impactEstimate?: {
    unit: "cents" | "percent" | "count" | "ratio";
    value: number | null;
    note?: string | null;
  };
  confidence: ExplanationConfidence;
  confidenceReasons: string[];
  evidence: ExplanationEvidenceItem[];
};

export type MetricExplanation = {
  metric: string;
  current_period: { startDate: string; endDate: string };
  comparison_period: { startDate: string; endDate: string };
  absolute_change: number | null;
  percentage_change: number | null;
  baseline: { currentValue: number | null; previousValue: number | null };

  primary_driver: ExplanationDriver | null;
  contributing_drivers: ExplanationDriver[];
  counteracting_drivers: ExplanationDriver[];

  possible_external_events: Array<{
    id: string;
    timestamp: string;
    source: string;
    channel: string;
    event_type: string;
    confidence: ExplanationConfidence;
    evidence: ExplanationEvidenceItem[];
  }>;

  alternative_explanations: Array<{
    hypothesis: string;
    evidence_for: string[];
    evidence_against: string[];
    effect_magnitude: string | null;
    confidence: ExplanationConfidence;
    conclusion: "supported" | "unsupported" | "inconclusive";
  }>;

  confidence: ExplanationConfidence;
  confidence_reasons: string[];

  data_used: Array<{ source: string; notes: string }>
  data_missing: string[];
  assumptions: string[];
  limitations: string[];
  recommended_follow_up: string[];
  evidence: ExplanationEvidenceItem[];
};

export type ExplainWorkflowRunNodeSummary = {
  nodeId: string;
  state: "ACCEPTED" | "MISSING" | "REJECTED";
  truthState: "ABSENT" | "UNKNOWN" | "CURRENT" | "STALE" | "CONFLICTED";
  evidenceCount: number;
};

export type ExplainWorkflowRunSummary = {
  version: "REVENUE_EXPLANATION_WORKFLOW_RUN_V1";
  graphId: string;
  runId: string;
  state: "COMPLETE" | "PARTIAL" | "DEGRADED" | "BLOCKED" | "FAILED";
  expectedNodeCount: number;
  acceptedNodeCount: number;
  missingBranches: string[];
  failedBranches: string[];
  plannedWaves: Array<{ index: number; nodeIds: string[] }>;
  observedTiming: {
    state: "NOT_OBSERVED" | "PARTIAL" | "OBSERVED";
    elapsedMs: number | null;
  };
  verifier: {
    state: "PASSED" | "FAILED" | "UNKNOWN";
    failedLenses: Array<"CORRECTNESS" | "FRESHNESS" | "SOURCE_SUPPORT">;
  };
  anchors: {
    requiredCount: number;
    passedCount: number;
    rejectedCanonicalRefs: string[];
    uniqueEvidenceIdentityCount: number;
  };
  evidenceCoverage: {
    expectedSources: string[];
    observedSources: string[];
    missingSources: string[];
    duplicateEvidenceCount: number;
  };
  budget: {
    state: "WITHIN_BUDGET" | "UNKNOWN" | "EXCEEDED";
    elapsedMs: number | null;
    costUsd: number | null;
  };
  nodes: ExplainWorkflowRunNodeSummary[];
};

export type ExplainResponse = {
  ok: boolean;
  generatedAt: string;
  dataMode?: "LIVE_DATA" | "PARTIAL_LIVE_DATA" | "SEED_DATA" | "UNAVAILABLE";
  explanation: MetricExplanation;
  timeline: {
    window: { startDate: string; endDate: string };
    sources: Array<{ source: string; status: "live" | "partial" | "stale" | "missing" | "failed" }>;
    events: Array<{
      timestamp: string;
      source: string;
      channel: string;
      event_type: string;
      confidence: ExplanationConfidence;
      evidence: ExplanationEvidenceItem[];
    }>;
  };
  workflowRun?: ExplainWorkflowRunSummary;
};

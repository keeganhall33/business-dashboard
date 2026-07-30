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
};


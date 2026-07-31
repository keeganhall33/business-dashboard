import type { ExplanationConfidence, ExplanationEvidenceItem } from "./explanation-contract";
import type { CommerceTelemetry, TelemetrySource } from "@/lib/types/dashboard";

export type TimelineEvent = {
  timestamp: string;
  source: string;
  channel: string;
  event_type: string;
  confidence: ExplanationConfidence;
  evidence: ExplanationEvidenceItem[];
};

export function buildEvidenceTimeline(input: {
  range: { startDate: string; endDate: string };
  commerceTelemetry: CommerceTelemetry | null;
  metaSummary?: Record<string, unknown> | null;
  missingSources: string[];
}): { sources: Array<{ source: string; status: "live" | "partial" | "stale" | "missing" | "failed" }>; events: TimelineEvent[] } {
  const sources: Array<{ source: string; status: "live" | "partial" | "stale" | "missing" | "failed" }> = [];
  const events: TimelineEvent[] = [];

  const addSource = (source: TelemetrySource | string, status: "live" | "partial" | "stale" | "missing" | "failed") => {
    sources.push({ source, status });
  };

  const missingSet = new Set(input.missingSources);

  addSource("woo", missingSet.has("woo") ? "missing" : input.commerceTelemetry?.woo?.summary?.hasData ? "live" : "partial");
  addSource("ga4", missingSet.has("ga4") ? "missing" : input.commerceTelemetry?.ga4?.summary?.sessions != null ? "partial" : "missing");
  addSource("meta", input.metaSummary ? "partial" : "missing");
  addSource("email", "missing");

  // Normalize daily points into timeline events (read-only).
  const addTimeseries = (source: TelemetrySource | string, metric: string, series: Array<{ date: string; value: number }>) => {
    for (const p of series) {
      events.push({
        timestamp: `${p.date}T12:00:00Z`,
        source: String(source),
        channel: String(source),
        event_type: `${metric}_daily`,
        confidence: "strongly_supported",
        evidence: [
          {
            id: `${source}:${metric}:${p.date}`,
            label: `${metric} on ${p.date}`,
            source: source === "woo" || source === "ga4" || source === "meta" ? (source as TelemetrySource) : "unknown",
            kind: "timeseries",
            details: { metric, date: p.date, value: p.value }
          }
        ]
      });
    }
  };

  const wooTs = input.commerceTelemetry?.woo?.timeseries ?? [];
  addTimeseries(
    "woo",
    "revenue",
    wooTs.map((p) => ({ date: p.date, value: p.revenue }))
  );
  addTimeseries(
    "woo",
    "orders",
    wooTs.map((p) => ({ date: p.date, value: p.orders }))
  );

  const gaTs = input.commerceTelemetry?.ga4?.timeseries ?? [];
  addTimeseries(
    "ga4",
    "sessions",
    gaTs.map((p) => ({ date: p.date, value: p.sessions }))
  );

  return { sources, events };
}

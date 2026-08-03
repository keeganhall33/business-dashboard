import { withJobRun } from "@/lib/scheduler/jobLogger";
import { formatPacificIsoDate, addDaysIso } from "@/lib/date/pacific";
import { runTrafficQualityMismatch } from "@/lib/intelligence-v1/traffic-quality-mismatch";
import { insertFacts, insertFinding, insertHypotheses, upsertRecommendation } from "@/lib/intelligence-v1/store";
import { computeRecommendationFingerprint } from "@/lib/actions/action-fingerprint";

export async function runIntelligenceTrafficQualityDaily() {
  const jobKey = "intelligence-traffic-quality";
  const startedAt = new Date().toISOString();

  return withJobRun({
    jobKey,
    fn: async () => {
      const pacificToday = formatPacificIsoDate(new Date());
      const endDate = addDaysIso(pacificToday, -1);
      const startDate = addDaysIso(endDate, -6);
      const prevEnd = addDaysIso(startDate, -1);
      const prevStart = addDaysIso(prevEnd, -6);

    const result = await runTrafficQualityMismatch({
      current: { startDate, endDate },
      comparison: { startDate: prevStart, endDate: prevEnd }
    });

    if (!result.finding || !result.opportunity || !result.recommendation) {
      return { ok: true, startedAt, note: "No material traffic-quality mismatch detected", generatedAt: result.generatedAt };
    }

    await insertFinding(result.finding);
    await insertHypotheses(result.hypotheses);

    // Persist minimal facts used by the finding (idempotent by uniqueness index).
    await insertFacts(
      (result.finding.facts_primary ?? []).
        filter((f) => typeof f.value === "number" && Number.isFinite(f.value))
        .map((f) => ({
          metric_id: f.metric_id,
          value: f.value as number,
          unit: f.unit,
          business_date: endDate,
          window_type: f.window.window_type,
          dimensions: f.dimensions,
          source_system: f.provenance.source_system,
          retrieved_at: result.generatedAt,
          source_as_of: f.provenance.source_as_of,
          freshness_state: f.data_quality.freshness_state,
          coverage_state: f.data_quality.coverage_state,
          attribution_defensible: f.data_quality.attribution_defensible,
          confidence_state: f.data_quality.confidence_state,
          metric_definition_version: f.metric_definition_version
        }))
    );

    const recommendation_fingerprint = computeRecommendationFingerprint({
      category: result.recommendation.category,
      channel: "intelligence",
      affected_products: result.recommendation.affected_products,
      affected_audiences: result.recommendation.affected_audiences,
      action_key: "traffic_quality_mismatch:isolate_segment_driver",
      evidence_window: { startDate, endDate }
    });

    await upsertRecommendation({
      recommendation_id: result.recommendation.id,
      recommendation_fingerprint,
      action_key: "traffic_quality_mismatch:isolate_segment_driver",
      detector_id: "traffic_quality_mismatch_v1",
      detector_version: "v1",
      recommendation_policy_version: "traffic_quality_mismatch_v1.0",
      finding_id: result.finding.finding_id,
      hypothesis_ids: result.hypotheses.map((h) => h.hypothesis_id),
      opportunity_id: result.opportunity.id,
      evidence_window: { startDate, endDate },
      baseline_window: { startDate: prevStart, endDate: prevEnd },
      evaluation_window: { startDate, endDate },
      success_metrics: [{ metric_id: "derived.purchase_conversion_pct", note: "Stops declining and improves vs baseline." }],
      success_threshold: result.recommendation.success_threshold,
      stop_condition: result.recommendation.stop_condition,
      what_changes_my_mind: result.recommendation.prerequisites,
      confidence: {
        level: result.recommendation.confidence,
        score: null,
        reasons: result.recommendation.confidence_reasons,
        blockers: result.recommendation.data_missing
      }
    });

    // Persist the remainder of the chain as an auditable payload in the job run log.
    // (Recommendation/opportunity reuse existing contracts; no parallel tables yet.)
      return {
        ok: true,
        startedAt,
        findingId: result.finding.finding_id,
        recommendationId: result.recommendation.id,
        payload: {
          finding: result.finding,
          hypotheses: result.hypotheses,
          opportunity: result.opportunity,
          recommendation: result.recommendation,
          recommendation_fingerprint,
          recommendation_policy_version: "traffic_quality_mismatch_v1.0",
          baseline_window: { startDate: prevStart, endDate: prevEnd },
          evaluation_window: { startDate, endDate },
          external_context: {
            version: "external_context_v1",
            asOf: null,
            signals_used: [],
            signals_missing: [
              "sports_intelligence",
              "music_intelligence",
              "entertainment_culture",
              "collector_market_liquidity",
              "search_social_momentum",
              "platform_policy_changes",
              "economic_context",
              "licensing_ip_context",
              "shipping_fulfillment_disruptions"
            ],
            notes: []
          },
          warnings: result.warnings
        }
      };
    },
    summarize: (result) => {
      const r = result as unknown as { note?: unknown; findingId?: unknown; payload?: Record<string, unknown> };
      return {
        summary: r.note ? String(r.note) : (r.findingId ? `finding ${String(r.findingId)}` : "no finding"),
        detailsJson: r.payload ?? {}
      };
    }
  });
}

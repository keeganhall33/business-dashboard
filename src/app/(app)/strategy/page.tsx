import { ExecutiveStrategyWorkspaceV1 } from "@/components/strategy/ExecutiveStrategyWorkspaceV1";
import { assessRecommendationContradictionsV1 } from "@/lib/core-intelligence/recommendation-contradiction/adapter";
import { buildExecutiveActionSynthesisV1 } from "@/lib/core-intelligence/executive-action-synthesis/adapter";
import { buildStrategyEvidenceReviewQueueV1 } from "@/lib/core-intelligence/strategy-evidence-review/adapter";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { computePreviousInclusiveDateRange } from "@/lib/dashboard/performance-baseline";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { buildRecommendationsFromExplanation } from "@/lib/intelligence/recommendation-engine";
import type { RecommendationsResponse } from "@/lib/intelligence/recommendation-contract";
import { buildExecutiveStrategyWorkspaceV1 } from "@/lib/strategy/executive-strategy-v1";
import { getCommerceTelemetry } from "@/lib/supabase/queries";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";
import { resolveRangeQuery } from "../_lib/resolve-range";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StrategyPage({ searchParams }: PageProps) {
  const { preset, start, end } = await resolveRangeQuery(searchParams);
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end });
  const sanitized = sanitizeDashboardPayloadForHtml(overview);
  const comparison = computePreviousInclusiveDateRange({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate });

  let recommendations: RecommendationsResponse | null = null;
  let evidenceReview = null;
  let synthesis = null;

  if (comparison) {
    try {
      const [currentTelemetry, previousTelemetry] = await Promise.all([
        getCommerceTelemetry({ startDate: sanitized.range.startDate, endDate: sanitized.range.endDate }),
        getCommerceTelemetry({ startDate: comparison.startDate, endDate: comparison.endDate }),
      ]);

      const current = {
        ...sanitized,
        commerceTelemetry: {
          range: sanitized.range,
          woo: currentTelemetry.woo ?? undefined,
          ga4: currentTelemetry.ga4 ?? undefined,
          funnel: currentTelemetry.funnel ?? undefined,
        },
      } satisfies DashboardOverviewResponse;

      const previousRange = { preset: "custom" as RangePreset, startDate: comparison.startDate, endDate: comparison.endDate };
      const previous = {
        ...sanitized,
        range: previousRange,
        commerceTelemetry: {
          range: previousRange,
          woo: previousTelemetry.woo ?? undefined,
          ga4: previousTelemetry.ga4 ?? undefined,
          funnel: previousTelemetry.funnel ?? undefined,
        },
      } satisfies DashboardOverviewResponse;

      const explanation = explainRevenueChange({
        metric: "revenue",
        currentRange: { startDate: sanitized.range.startDate, endDate: sanitized.range.endDate },
        comparisonRange: comparison,
        current,
        previous,
      });

      // Reuse the existing production recommendation boundary. These remain explicit blind spots
      // in the current recommendation route until their canonical telemetry is wired there.
      recommendations = buildRecommendationsFromExplanation({ explanation, missingSources: ["email", "matchback"] });
      const generatedAt = recommendations.generatedAt;
      const contradictionAssessment = assessRecommendationContradictionsV1({
        contract_version: "recommendation_contradiction_input_v1",
        generated_at: generatedAt,
        recommendations: recommendations.recommendations,
      });
      evidenceReview = buildStrategyEvidenceReviewQueueV1({
        contract_version: "strategy_evidence_review_queue_input_v1",
        generated_at: generatedAt,
        recommendations: recommendations.recommendations,
        contradiction_assessment: contradictionAssessment,
        // No production confidence-guard evidence bridge exists for this route yet. Leaving the
        // guard list empty intentionally preserves freshness as UNKNOWN rather than manufacturing it.
        confidence_guards: [],
      });
      synthesis = buildExecutiveActionSynthesisV1({
        contract_version: "executive_action_synthesis_input_v1",
        generated_at: generatedAt,
        recommendations: recommendations.recommendations,
        evidence_review_queue: evidenceReview,
      });
    } catch {
      recommendations = null;
      evidenceReview = null;
      synthesis = null;
    }
  }

  const model = buildExecutiveStrategyWorkspaceV1({
    recommendations,
    evidenceReview,
    synthesis,
    generatedAt: sanitized.timestamp,
  });

  return <ExecutiveStrategyWorkspaceV1 model={model} />;
}

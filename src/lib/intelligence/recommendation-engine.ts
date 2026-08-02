import type { ExplainResponse } from "./explanation-contract";
import type {
  RecommendationsResponse,
  Recommendation,
  RecommendationCategory,
  ApprovalLevel,
  RecommendationStatus
} from "./recommendation-contract";
import { detectOpportunities } from "./opportunity-detection";
import { scorePriority } from "./priority-scoring";
import { conservativeRevenueRange } from "./impact-estimation";
import { guardrailForCategory } from "./recommendation-guardrails";
import { prepareDraftAssets } from "./action-preparation";

function nowIso() {
  return new Date().toISOString();
}

function baseRec(partial: Partial<Recommendation> & { id: string; title: string; category: RecommendationCategory }): Recommendation {
  return {
    id: partial.id,
    title: partial.title,
    category: partial.category,
    recommended_action: partial.recommended_action ?? "",
    reason: partial.reason ?? "",
    supporting_evidence: partial.supporting_evidence ?? [],
    affected_products: partial.affected_products ?? [],
    affected_channels: partial.affected_channels ?? [],
    affected_audiences: partial.affected_audiences ?? [],
    expected_outcome: partial.expected_outcome ?? "",
    estimated_incremental_revenue:
      partial.estimated_incremental_revenue ?? {
        currency: "UNKNOWN",
        horizon: "unknown",
        low_incremental_revenue_cents: null,
        expected_incremental_revenue_cents: null,
        high_incremental_revenue_cents: null,
        notes: [],
        assumptions: []
      },
    estimated_incremental_profit: partial.estimated_incremental_profit ?? null,
    estimated_cost: partial.estimated_cost ?? { money_cents: null, notes: [] },
    estimated_effort: partial.estimated_effort ?? { hours: null, level: "medium", notes: [] },
    time_to_impact: partial.time_to_impact ?? "unknown",
    confidence: partial.confidence ?? "possible",
    confidence_reasons: partial.confidence_reasons ?? [],
    urgency: partial.urgency ?? "medium",
    priority_score:
      partial.priority_score ??
      scorePriority({
        revenuePotential: 0.4,
        confidence: 0.4,
        urgency: 0.4,
        timeToImpact: 0.4,
        effortInverse: 0.5,
        costInverse: 0.5,
        riskInverse: 0.5,
        strategicFit: 0.6,
        executionReadiness: 0.4
      }),
    risk: partial.risk ?? "medium",
    downside: partial.downside ?? [],
    prerequisites: partial.prerequisites ?? [],
    execution_steps: partial.execution_steps ?? [],
    prepared_assets: partial.prepared_assets ?? [],
    approval_level: partial.approval_level ?? ("L1_RECOMMENDATION" as ApprovalLevel),
    measurement_plan: partial.measurement_plan ?? "",
    success_threshold: partial.success_threshold ?? "",
    stop_condition: partial.stop_condition ?? "",
    review_date: partial.review_date ?? null,
    data_used: partial.data_used ?? [],
    data_missing: partial.data_missing ?? [],
    assumptions: partial.assumptions ?? [],
    limitations: partial.limitations ?? [],
    status: partial.status ?? ("recommended" as RecommendationStatus)
  };
}

export function buildRecommendationsFromExplanation(input: {
  explanation: ExplainResponse;
  missingSources: string[];
}): RecommendationsResponse {
  const ex = input.explanation.explanation;
  const baselineRevenue = ex.baseline.currentValue;

  // Opportunity detection is available via the Opportunities API/center. Keep recommendations focused.
  detectOpportunities({ explanation: ex, missingSources: input.missingSources });
  const guardrailsTriggered: string[] = [];
  const warnings: string[] = [];

  const recs: Recommendation[] = [];

  // 1) If insufficient evidence, recommend do-nothing + data connection.
  if (ex.confidence === "insufficient_evidence") {
    recs.push(
      baseRec({
        id: "rec_do_nothing_wait",
        title: "Wait for more data",
        category: "do_nothing",
        recommended_action: "Do not change spend or outreach yet. Wait and re-evaluate once more telemetry arrives.",
        reason: "Current evidence is insufficient to identify a primary driver.",
        supporting_evidence: ex.evidence,
        expected_outcome: "Avoid overreacting to noise.",
        confidence: "strongly_supported",
        confidence_reasons: ["Engine confidence is insufficient_evidence; best action is to wait."],
        urgency: "medium",
        risk: "low",
        approval_level: "L1_RECOMMENDATION",
        measurement_plan: "Re-run explanation daily until confidence improves.",
        success_threshold: "Data completeness improves and driver confidence rises to likely or above.",
        stop_condition: "If sustained decline persists for 7+ days, escalate to controlled experiment.",
        data_used: ex.data_used,
        data_missing: ex.data_missing,
        assumptions: ex.assumptions,
        limitations: ex.limitations
      })
    );

    recs.push(
      baseRec({
        id: "rec_connect_email_telemetry",
        title: "Connect missing email telemetry (read-only)",
        category: "data_connection",
        recommended_action: "Identify the email platform and ingest campaigns/flows telemetry read-only.",
        reason: "Email is a major driver but currently invisible, blocking confident decisions.",
        supporting_evidence: ex.evidence,
        expected_outcome: "Higher explanation accuracy and safer recommendations.",
        confidence: "strongly_supported",
        confidence_reasons: ["Email is listed as missing data; explanations cannot attribute lifecycle effects."],
        urgency: "high",
        risk: "low",
        approval_level: "L1_RECOMMENDATION",
        measurement_plan: "Confirm new telemetry populates with coverage and freshness metadata.",
        success_threshold: "Email sends/opens/clicks available for explanations.",
        stop_condition: "If vendor/API access not feasible, implement export-based fallback.",
        data_used: ex.data_used,
        data_missing: ex.data_missing,
        assumptions: ex.assumptions,
        limitations: ex.limitations
      })
    );

    return {
      ok: true,
      generatedAt: nowIso(),
      dataMode: input.explanation.dataMode,
      window: ex.current_period,
      recommendations: recs,
      guardrailsTriggered,
      warnings
    };
  }

  // 2) Traffic driver: propose promotion / channel investigation.
  if ((ex.primary_driver?.label ?? "").includes("Traffic")) {
    const category: RecommendationCategory = input.missingSources.includes("matchback") ? "measurement" : "scale";
    const guard = guardrailForCategory({ category, confidence: ex.confidence, ctx: {
      dataMode: input.explanation.dataMode,
      missingSources: input.missingSources,
      sampleSize: { orders: (ex.baseline.currentValue != null ? null : null), sessions: null },
      outlierFlag: false
    }});
    if (!guard.allow) guardrailsTriggered.push(...guard.reasons);

    const est = conservativeRevenueRange({
      baselineRevenueCents: baselineRevenue,
      confidence: ex.confidence,
      heuristicLiftPct: 5,
      horizon: "7d",
      notes: ["Conservative heuristic until email + matchback are connected."],
      assumptions: ["Traffic can be restored via proven channels without harming conversion."]
    });

    const rec = baseRec({
      id: "rec_traffic_driver",
      title: "Traffic-driven change: restore/verify qualified traffic",
      category,
      recommended_action:
        category === "measurement"
          ? "Do not scale spend yet. Identify which channel(s) changed traffic and validate attribution coverage."
          : "Scale qualified traffic cautiously toward the highest-converting funnel while monitoring conversion.",
      reason: "The explanation indicates the primary driver is traffic (sessions).",
      supporting_evidence: ex.evidence,
      expected_outcome: "Stabilize revenue by stabilizing qualified traffic.",
      estimated_incremental_revenue: est,
      confidence: ex.confidence,
      confidence_reasons: ex.confidence_reasons,
      urgency: "high",
      risk: category === "scale" ? "high" : "medium",
      downside: ["Attribution limitations may cause duplicated credit.", "Scaling without matchback can waste spend."],
      prerequisites: input.missingSources.includes("matchback") ? ["Implement matchback"] : [],
      execution_steps: [
        "Check GA4 sessions trend and campaign UTMs",
        "Compare Meta spend changes to traffic changes",
        "If conversion stable, prepare a small-scale traffic test"
      ],
      approval_level: "L1_RECOMMENDATION",
      measurement_plan: "Monitor sessions, conversion rate, and net revenue daily for 7 days.",
      success_threshold: "Revenue recovers without conversion degradation.",
      stop_condition: "Stop if conversion drops materially or spend rises without orders.",
      data_used: ex.data_used,
      data_missing: ex.data_missing,
      assumptions: ex.assumptions,
      limitations: ex.limitations
    });

    const prepared = prepareDraftAssets({ recommendation: rec, category });
    rec.prepared_assets = prepared.assets;
    rec.approval_level = prepared.nextApprovalLevel;
    rec.status = prepared.assets.length ? "draft_prepared" : "recommended";

    rec.priority_score = scorePriority({
      revenuePotential: 0.7,
      confidence: ex.confidence === "likely" ? 0.7 : ex.confidence === "strongly_supported" ? 0.85 : 0.45,
      urgency: 0.75,
      timeToImpact: 0.7,
      effortInverse: 0.5,
      costInverse: 0.6,
      riskInverse: category === "scale" ? 0.35 : 0.55,
      strategicFit: 0.7,
      executionReadiness: category === "measurement" ? 0.6 : 0.4
    });

    recs.push(rec);
  }

  // 3) Always include top data-connection opportunities when missing.
  if (input.missingSources.includes("email")) {
    recs.push(
      baseRec({
        id: "rec_email_blocker",
        title: "Email is a blind spot — connect telemetry (read-only)",
        category: "data_connection",
        recommended_action: "Identify the email vendor and ingest campaign/flow telemetry read-only.",
        reason: "Email can materially change revenue but is not currently observable.",
        supporting_evidence: ex.evidence,
        expected_outcome: "Higher explanation confidence and safer recommendations.",
        confidence: "strongly_supported",
        confidence_reasons: ["Email source missing is explicitly listed in data_missing."],
        urgency: "high",
        risk: "low",
        approval_level: "L1_RECOMMENDATION",
        measurement_plan: "Verify email sends/opens/clicks appear in Evidence Timeline.",
        success_threshold: "Email telemetry coverage and freshness available.",
        stop_condition: "If vendor access blocked, implement export-based ingestion.",
        data_used: ex.data_used,
        data_missing: ex.data_missing,
        assumptions: ex.assumptions,
        limitations: ex.limitations
      })
    );
  }

  // 4) If nothing else, do-nothing.
  if (!recs.length) {
    warnings.push("No strong evidence-backed recommendations for this window.");
    recs.push(
      baseRec({
        id: "rec_default_wait",
        title: "Do nothing yet",
        category: "do_nothing",
        recommended_action: "Wait for more data and re-check tomorrow.",
        reason: "No recommendation passed guardrails with sufficient confidence.",
        supporting_evidence: ex.evidence,
        expected_outcome: "Avoid unnecessary action.",
        confidence: "possible",
        confidence_reasons: ["Guardrails or missing telemetry prevented actionable recommendation."],
        urgency: "low",
        risk: "low",
        approval_level: "L1_RECOMMENDATION",
        measurement_plan: "Re-run explanation daily.",
        success_threshold: "Confidence improves.",
        stop_condition: "If negative trend persists, escalate.",
        data_used: ex.data_used,
        data_missing: ex.data_missing,
        assumptions: ex.assumptions,
        limitations: ex.limitations
      })
    );
  }

  // Stable sort: highest score first, then id.
  recs.sort((a, b) => b.priority_score.overallScore - a.priority_score.overallScore || a.id.localeCompare(b.id));

  return {
    ok: true,
    generatedAt: nowIso(),
    dataMode: input.explanation.dataMode,
    window: ex.current_period,
    recommendations: recs,
    guardrailsTriggered,
    warnings
  };
}

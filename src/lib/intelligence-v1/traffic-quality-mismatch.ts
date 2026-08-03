import type {
  FactRef,
  TrafficQualityMismatchResult,
  Finding,
  Hypothesis,
  Confidence
} from "@/lib/intelligence-v1/contracts";
import type { Opportunity, Recommendation, ExpectedImpactRange, PriorityBreakdown } from "@/lib/intelligence/recommendation-contract";

const ENGINE_VERSION = "v1";
const DETECTOR_ID = "traffic_quality_mismatch_v1";
const TZ = "America/Los_Angeles";
const METRIC_DEF_VERSION = "v1";

type CommerceTelemetryLike = {
  woo?: {
    summary?: {
      orders?: number | null;
      revenue?: number | null;
      avgOrderValue?: number | null;
      completeness?: "complete" | "partial" | "unknown" | null;
      asOf?: string | null;
    } | null;
    timeseries?: Array<{ date: string; revenue: number; orders: number }>;
  } | null;
  ga4?: {
    summary?: {
      sessions?: number | null;
      engagedSessions?: number | null;
    } | null;
    timeseries?: Array<{ date: string; sessions: number }>;
  } | null;
};

export type TrafficQualityConfig = {
  minSessions: number;
  minOrders: number;
  minSessionsIncreasePct: number; // e.g. 15
  minConversionDropPct: number; // e.g. 15
  minConversionAbsDropPctPoints: number; // e.g. 0.05 means 0.05 percentage points? (we use percentage points)
  singleDaySpikeShare: number; // e.g. 0.6 (60% of delta)
};

export const DEFAULT_CONFIG: TrafficQualityConfig = {
  minSessions: 500,
  minOrders: 10,
  minSessionsIncreasePct: 15,
  minConversionDropPct: 15,
  // purchase conversion is in percent units; require at least 0.1pp absolute drop
  minConversionAbsDropPctPoints: 0.1,
  singleDaySpikeShare: 0.6
};

function pctChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function fact(metric_id: string, value: number | null, unit: FactRef["unit"], window: FactRef["window"], provenance: FactRef["provenance"], data_quality: FactRef["data_quality"], dimensions: Record<string, unknown> = {}): FactRef {
  return {
    metric_id,
    value,
    unit,
    window,
    dimensions,
    provenance,
    data_quality,
    metric_definition_version: METRIC_DEF_VERSION
  };
}

function confidence(level: Confidence["level"], score: number | null, reasons: string[], blockers: string[] = []): Confidence {
  return { level, score, reasons, blockers };
}

function stableId(prefix: string, parts: string[]) {
  return `${prefix}_${parts.join("_").replace(/[^a-zA-Z0-9_:-]+/g, "_")}`;
}

function computePurchaseConversionPct(orders: number | null, sessions: number | null): number | null {
  if (orders == null || sessions == null) return null;
  if (sessions <= 0) return null;
  return (orders / sessions) * 100;
}

function evaluateSingleDaySpikeShare(series: Array<{ date: string; value: number }>, delta: number): { passed: boolean; detail: string | null } {
  if (!Number.isFinite(delta) || delta <= 0) return { passed: true, detail: null };
  const max = series.reduce((m, p) => (p.value > m ? p.value : m), 0);
  // Spike guard is approximate: if a single day accounts for too much of the *current* total,
  // we treat as potentially volatile.
  const total = series.reduce((acc, p) => acc + p.value, 0);
  if (total <= 0) return { passed: true, detail: null };
  const share = max / total;
  return {
    passed: share < 0.5,
    detail: `maxDayShare=${(share * 100).toFixed(1)}%`
  };
}

export async function runTrafficQualityMismatch(input: {
  // Window is daily-aligned by date strings; we rely on telemetry functions to align.
  current: { startDate: string; endDate: string };
  comparison: { startDate: string; endDate: string };
  config?: Partial<TrafficQualityConfig>;
  fetchNowIso?: string;
  fetchCommerceTelemetry?: (range: { startDate: string; endDate: string }) => Promise<CommerceTelemetryLike>;
}): Promise<TrafficQualityMismatchResult> {
  const nowIso = input.fetchNowIso ?? new Date().toISOString();
  const cfg: TrafficQualityConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };

  const warnings: string[] = [];

  const fetcher =
    input.fetchCommerceTelemetry ??
    (((await import("@/lib/supabase/queries")).getCommerceTelemetry as unknown) as (
      range: { startDate: string; endDate: string }
    ) => Promise<CommerceTelemetryLike>);
  const [currentTelemetry, previousTelemetry] = await Promise.all([
    fetcher({ startDate: input.current.startDate, endDate: input.current.endDate }),
    fetcher({ startDate: input.comparison.startDate, endDate: input.comparison.endDate })
  ]);

  const currentWoo = currentTelemetry?.woo?.summary ?? null;
  const prevWoo = previousTelemetry?.woo?.summary ?? null;
  const currentGa = currentTelemetry?.ga4?.summary ?? null;
  const prevGa = previousTelemetry?.ga4?.summary ?? null;

  const currentSessions = currentGa?.sessions ?? null;
  const prevSessions = prevGa?.sessions ?? null;
  const currentOrders = currentWoo?.orders ?? null;
  const prevOrders = prevWoo?.orders ?? null;
  const currentRevenue = currentWoo?.revenue ?? null;
  const prevRevenue = prevWoo?.revenue ?? null;

  const currentAov = currentWoo?.avgOrderValue ?? (currentWoo?.orders && currentWoo?.revenue != null ? currentWoo.revenue / currentWoo.orders : null);
  const prevAov = prevWoo?.avgOrderValue ?? (prevWoo?.orders && prevWoo?.revenue != null ? prevWoo.revenue / prevWoo.orders : null);

  const currentConv = computePurchaseConversionPct(currentOrders, currentSessions);
  const prevConv = computePurchaseConversionPct(prevOrders, prevSessions);

  const sessionsPct = pctChange(currentSessions, prevSessions);
  const convPct = pctChange(currentConv, prevConv);
  const convAbsDrop = currentConv != null && prevConv != null ? prevConv - currentConv : null;
  const ordersPct = pctChange(currentOrders, prevOrders);
  const revenuePct = pctChange(currentRevenue, prevRevenue);
  const aovPct = pctChange(currentAov, prevAov);

  const window: Finding["window"] = {
    timezone: TZ,
    current: input.current,
    comparison: input.comparison
  };

  const primaryFacts: FactRef[] = [];
  const evidenceFor: FactRef[] = [];
  const evidenceAgainst: FactRef[] = [];
  const missingEvidence: string[] = [];
  const falsePositiveGuards: Finding["false_positive_guards"] = [];
  const confidenceReasons: string[] = [];
  const blockers: string[] = [];

  // Data quality gating: this detector is non-causal and should be conservative.
  // If commerce telemetry is partial/unknown, suppress rather than emit an operating recommendation.
  const wooCompleteness = currentWoo?.completeness ?? "unknown";
  if (wooCompleteness !== "complete") {
    blockers.push(
      `Commerce telemetry completeness is ${wooCompleteness}; suppressing traffic-quality mismatch finding until complete telemetry is available.`
    );
  }

  const baseWindow = { start_ts: `${input.current.startDate}T00:00:00.000Z`, end_ts: `${input.current.endDate}T23:59:59.999Z`, timezone: TZ, window_type: "selected_range_snapshot" as const };
  const baseProv = { source_system: "internal" as const, source_run_id: null, snapshot_id: null, retrieved_at: nowIso, source_as_of: null };
  const baseQ = {
    freshness_state: (currentWoo?.completeness === "partial" ? "stale" : "unknown") as "stale" | "unknown",
    coverage_state: (currentWoo?.completeness ?? "unknown") as "complete" | "partial" | "unknown",
    attribution_defensible: "not_applicable" as const,
    confidence_state: "trusted" as const
  };

  const fSessions = fact("ga4.sessions_count", currentSessions, "count", baseWindow, { ...baseProv, source_system: "ga4", source_as_of: null }, baseQ);
  const fOrders = fact("woo.orders_count", currentOrders, "count", baseWindow, { ...baseProv, source_system: "woo", source_as_of: currentWoo?.asOf ?? null }, baseQ);
  const fRevenue = fact("woo.revenue_net_usd", currentRevenue, "usd", baseWindow, { ...baseProv, source_system: "woo", source_as_of: currentWoo?.asOf ?? null }, baseQ);
  const fAov = fact("woo.aov_usd", currentAov, "usd", baseWindow, { ...baseProv, source_system: "woo", source_as_of: currentWoo?.asOf ?? null }, baseQ);
  const fConv = fact("derived.purchase_conversion_pct", currentConv, "percent", baseWindow, baseProv, baseQ);

  primaryFacts.push(fSessions, fOrders, fRevenue, fAov, fConv);

  // Minimum volume guardrails
  if ((currentSessions ?? 0) < cfg.minSessions || (prevSessions ?? 0) < cfg.minSessions) {
    blockers.push("Insufficient session volume for reliable traffic-quality inference.");
  }
  if ((currentOrders ?? 0) < cfg.minOrders || (prevOrders ?? 0) < cfg.minOrders) {
    blockers.push("Insufficient order volume for reliable purchase conversion inference.");
  }

  // Trigger conditions
  const sessionsUp = sessionsPct != null && sessionsPct >= cfg.minSessionsIncreasePct;
  const convDown = convPct != null && convPct <= -cfg.minConversionDropPct;
  const convAbsOk = convAbsDrop != null && convAbsDrop >= cfg.minConversionAbsDropPctPoints;

  if (!sessionsUp) confidenceReasons.push("Sessions did not increase materially.");
  if (!convDown || !convAbsOk) confidenceReasons.push("Purchase conversion did not decline materially.");

  // Single-day spike suppression (uses GA4 daily sessions series if present)
  const currentSeries = (currentTelemetry?.ga4?.timeseries ?? []).map((p) => ({ date: p.date, value: p.sessions }));
  if (currentSeries.length >= 5) {
    const guard = evaluateSingleDaySpikeShare(currentSeries, (currentSessions ?? 0) - (prevSessions ?? 0));
    falsePositiveGuards.push({ guard: "single_day_spike_share", passed: guard.passed, detail: guard.detail });
    if (!guard.passed) blockers.push("Single-day spike dominates the window; treat as volatile.");
  } else {
    missingEvidence.push("GA4 daily sessions timeseries unavailable; cannot suppress single-day spikes.");
  }

  const hasTrigger = sessionsUp && convDown && convAbsOk && blockers.length === 0;
  if (!hasTrigger) {
    return {
      ok: true,
      generatedAt: nowIso,
      finding: null,
      hypotheses: [],
      opportunity: null,
      recommendation: null,
      evidence_edges: [],
      warnings: blockers.length ? blockers : warnings
    };
  }

  evidenceFor.push(fSessions, fConv);
  if (ordersPct != null && ordersPct < 0) evidenceFor.push(fOrders);

  // Contradictory evidence: revenue holding up, or AOV rising can counteract
  if (revenuePct != null && revenuePct > 0) evidenceAgainst.push(fRevenue);
  if (aovPct != null && aovPct > 0) evidenceAgainst.push(fAov);

  // Missing evidence for deeper disambiguation (only record if we don't have it)
  missingEvidence.push(
    "GA4 source/medium mix for the window",
    "GA4 device mix for the window",
    "Top landing pages and engagement by source/device",
    "FunnelKit completion (to distinguish checkout friction vs traffic quality)",
    "Session quality proxy (engaged sessions per session) by source/device"
  );

  const materialityScore = Math.max(0, Math.min(100, ((Math.abs(sessionsPct ?? 0) + Math.abs(convPct ?? 0)) / 2)));

  // Deterministic, explainable confidence calibration.
  // Start from the base relationship confidence, then apply conservative downgrades.
  let confLevel: Confidence["level"] = "possible";
  let confScore = 0.55;
  const confReasons: string[] = [
    "Sessions increased while purchase conversion declined.",
    "This is a relationship detector (non-causal) and requires segment breakdowns to identify the driver."
  ];
  const confBlockers: string[] = [];

  // Contradiction downgrade: if revenue/AOV improved materially, the implied business impact is less clear.
  const CONTRADICTION_PCT = 10; // deterministic threshold
  const revenueContradicts = revenuePct != null && revenuePct >= CONTRADICTION_PCT;
  const aovContradicts = aovPct != null && aovPct >= CONTRADICTION_PCT;
  if (revenueContradicts || aovContradicts) {
    confScore = 0.35;
    confReasons.push(
      `Contradictory evidence: revenue and/or AOV increased materially (>= ${CONTRADICTION_PCT}%), weakening the traffic-quality harm interpretation.`
    );
    confBlockers.push("Counter-evidence present; treat as a diagnostic, not an operating directive.");
  }

  const conf = confidence(confLevel, confScore, confReasons, confBlockers);

  const findingId = stableId("find", [DETECTOR_ID, input.current.startDate, input.current.endDate]);
  const finding: Finding = {
    finding_id: findingId,
    detector_id: DETECTOR_ID,
    engine_version: ENGINE_VERSION,
    type: "relationship",
    title: "Traffic up, purchase conversion down",
    summary: "Sessions increased while purchase conversion declined.",
    window,
    materiality_score: materialityScore,
    false_positive_guards: falsePositiveGuards,
    facts_primary: primaryFacts,
    evidence_for: evidenceFor,
    evidence_against: evidenceAgainst,
    missing_evidence: missingEvidence,
    confidence: conf,
    created_at: nowIso
  };

  // Competing hypotheses (deterministic templates; evidence lists are placeholders until dimensions are available)
  const hypotheses: Hypothesis[] = [
    {
      hypothesis_id: stableId("hyp", [findingId, "mix"]),
      finding_id: findingId,
      engine_version: ENGINE_VERSION,
      statement: "Traffic mix shifted toward lower-intent visitors.",
      mechanism: "A larger share of sessions came from sources that historically convert poorly, reducing overall purchase conversion.",
      predictions: [{ metric_id: "ga4.sessions_count", expected_direction: "up", lag_days: null, note: "source/medium mix shows growth concentrated in low-quality segments" }],
      disambiguation_test: { test_id: "test_source_medium_mix", description: "Compare current vs prior GA4 sessions by source/medium; identify segments with largest share increase.", success_metric_id: "derived.purchase_conversion_pct", evaluation_window_days: 7 },
      evidence_for: [fSessions, fConv],
      evidence_against: [],
      missing_evidence: ["GA4 source/medium sessions breakdown"],
      confidence: confidence("possible", 0.5, ["Traffic increased; mix shifts are a common driver."], ["Source/medium breakdown unavailable"]),
      created_at: nowIso
    },
    {
      hypothesis_id: stableId("hyp", [findingId, "device"]),
      finding_id: findingId,
      engine_version: ENGINE_VERSION,
      statement: "Device mix shifted toward a lower-performing experience.",
      mechanism: "More sessions came from mobile or a device category with lower conversion, lowering overall purchase conversion.",
      predictions: [{ metric_id: "ga4.sessions_count", expected_direction: "up", lag_days: null, note: "device share shift aligns with conversion drop" }],
      disambiguation_test: { test_id: "test_device_mix", description: "Compare current vs prior GA4 sessions by device category; check engagement and conversion proxies.", success_metric_id: "derived.purchase_conversion_pct", evaluation_window_days: 7 },
      evidence_for: [fSessions, fConv],
      evidence_against: [],
      missing_evidence: ["GA4 device sessions breakdown"],
      confidence: confidence("possible", 0.45, ["Device mix shifts can move conversion materially."], ["Device breakdown unavailable"]),
      created_at: nowIso
    },
    {
      hypothesis_id: stableId("hyp", [findingId, "funnel"]),
      finding_id: findingId,
      engine_version: ENGINE_VERSION,
      statement: "Checkout or funnel friction increased.",
      mechanism: "Visitors are reaching the site but dropping at checkout/funnel steps, reducing purchase conversion despite traffic.",
      predictions: [{ metric_id: "derived.funnel_completion_pct", expected_direction: "down", lag_days: null, note: "funnel completion declines alongside purchase conversion" }],
      disambiguation_test: { test_id: "test_funnel_completion", description: "Check FunnelKit entries/completions and completion rate for the window vs prior.", success_metric_id: "derived.funnel_completion_pct", evaluation_window_days: 7 },
      evidence_for: [fConv],
      evidence_against: [],
      missing_evidence: ["FunnelKit completion telemetry"],
      confidence: confidence("possible", 0.35, ["Conversion declined; funnel friction is plausible."], ["Funnel telemetry unavailable"]),
      created_at: nowIso
    }
  ];

  const opportunityId = stableId("opp", [findingId, "traffic_quality_mismatch"]);

  const estimated_upside: ExpectedImpactRange = {
    currency: "UNKNOWN",
    horizon: "7d",
    low_incremental_revenue_cents: null,
    expected_incremental_revenue_cents: null,
    high_incremental_revenue_cents: null,
    notes: ["Impact estimate unavailable without channel mix + lag-aware attribution."],
    assumptions: []
  };

  const opportunity: Opportunity = {
    id: opportunityId,
    type: "high_traffic_low_conversion",
    title: "Traffic up while purchase conversion down",
    detection_rule: "sessions up materially AND purchase conversion down materially (7d vs prior 7d)",
    evidence: [],
    confidence: conf.level,
    estimated_upside,
    effort: "low",
    cost: { money_cents: null, notes: ["Read-only analysis first"] },
    urgency: "high",
    dependencies: missingEvidence,
    recommended_action: "Before changing spend or redesigning checkout, isolate the source/medium + device segment responsible for the traffic increase and verify its engagement quality.",
    review_date: null,
    expiration: null
  };

  const priority_score: PriorityBreakdown = {
    revenuePotential: 0.6,
    confidence: 0.55,
    urgency: 0.8,
    timeToImpact: 0.8,
    effortInverse: 0.9,
    costInverse: 0.9,
    riskInverse: 0.7,
    strategicFit: 0.8,
    executionReadiness: 0.5,
    overallScore: 72,
    formula: "Heuristic: urgent + low effort + moderate confidence"
  };

  const recommendationId = stableId("rec", [DETECTOR_ID, input.current.startDate, input.current.endDate]);
  const recommendation: Recommendation = {
    id: recommendationId,
    title: "Isolate traffic quality before changing spend or site",
    category: "website",
    recommended_action:
      "Identify the GA4 source/medium and device segments responsible for the session increase vs prior 7d, then compare engagement quality and purchase conversion proxies for those segments before taking scaling or CRO actions.",
    reason:
      "Sessions increased materially while purchase conversion declined. The highest-information next step is to isolate whether the binding constraint is traffic quality/mix shift versus conversion execution.",
    supporting_evidence: [],
    affected_products: [],
    affected_channels: ["ga4", "woo"],
    affected_audiences: [],
    expected_outcome: "Clarify whether the constraint is traffic quality vs conversion execution; avoid scaling low-quality traffic.",
    estimated_incremental_revenue: {
      currency: "UNKNOWN",
      horizon: "7d",
      low_incremental_revenue_cents: null,
      expected_incremental_revenue_cents: null,
      high_incremental_revenue_cents: null,
      notes: ["Impact estimate intentionally omitted until segment drivers are identified."],
      assumptions: []
    },
    estimated_incremental_profit: null,
    estimated_cost: { money_cents: null, notes: ["No spend change recommended in this step"] },
    estimated_effort: { hours: 2, level: "low", notes: ["Read-only segment isolation"] },
    time_to_impact: "hours",
    confidence: conf.level,
    confidence_reasons: conf.reasons,
    urgency: "high",
    priority_score,
    risk: "low",
    downside: ["If ignored, you may scale into low-quality traffic or optimize the wrong constraint."],
    prerequisites: missingEvidence,
    execution_steps: [
      "Pull GA4 sessions by source/medium and device for current vs prior 7d",
      "Identify top share shifts",
      "Compare engaged sessions per session and any available checkout/funnel proxies",
      "Only then decide: spend adjustment vs funnel/CRO focus"
    ],
    prepared_assets: [],
    approval_level: "L1_RECOMMENDATION",
    measurement_plan: "Evaluate purchase conversion and engagement quality for the identified segments over the next 7 days.",
    success_threshold: "Purchase conversion stops declining and segment engagement quality stabilizes or improves.",
    stop_condition: "If funnel completion declines materially, pivot to funnel/checkout friction investigation.",
    review_date: null,
    data_used: [
      { source: "Woo selected-range telemetry", notes: "orders, net revenue, asOf" },
      { source: "GA4 aggregate telemetry", notes: "sessions (and engaged sessions when available)" }
    ],
    data_missing: missingEvidence,
    assumptions: ["Attribution is not required for this relationship; this is cross-channel correlation only."],
    limitations: ["Does not claim causality. Requires GA4 breakdowns to identify which traffic is responsible."],
    status: "recommended"
  };

  return {
    ok: true,
    generatedAt: nowIso,
    finding,
    hypotheses,
    opportunity,
    recommendation,
    evidence_edges: [],
    warnings
  };
}

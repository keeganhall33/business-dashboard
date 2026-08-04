import { z } from "zod";

import type { FusionCandidate } from "@/lib/fusion-v1/contracts";
import type { DashboardSnapshotRecord } from "@/lib/supabase/queries";
import { normalizeConfidenceTo01 } from "@/lib/fusion-v1/confidence-normalization";

export type SnapshotFreshnessClass = "fresh" | "monitor_only" | "stale";

function daysBetween(nowIso: string, generatedAtIso: string): number {
  const now = new Date(nowIso).getTime();
  const t = new Date(generatedAtIso).getTime();
  return Math.floor((now - t) / (24 * 3600 * 1000));
}

function classifyFreshness(input: {
  snapshotKey: string;
  ageDays: number;
}): SnapshotFreshnessClass {
  const age = input.ageDays;
  if (input.snapshotKey === "marketing_command") {
    if (age <= 7) return "fresh";
    if (age <= 14) return "monitor_only";
    return "stale";
  }
  // website/product_conversion
  if (age <= 14) return "fresh";
  if (age <= 30) return "monitor_only";
  return "stale";
}

const baseSnapshotSchema = z.object({ generatedAt: z.string().datetime().optional(), status: z.string().optional() }).passthrough();

const productConversionSchema = baseSnapshotSchema.extend({
  supportedRanges: z.array(z.string()).optional(),
  rows: z.array(
    z.object({
      productId: z.number().optional(),
      productName: z.string(),
      classification: z.string().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
      summary: z.string().optional(),
      recommendedAction: z.string().optional(),
      tags: z.array(z.string()).optional(),
      url: z.string().optional()
    })
  )
});

const websiteSchema = baseSnapshotSchema.extend({
  ga4Window: z
    .object({ startDate: z.string().optional(), endDate: z.string().optional(), timezone: z.string().optional(), label: z.string().optional() })
    .optional(),
  ga4: z
    .object({ sessions: z.number().optional(), ecommercePurchases: z.number().optional(), purchaseRevenue: z.number().optional(), warnings: z.array(z.string()).optional() })
    .optional(),
  wooCommerce: z
    .object({ paidOrdersInWindow: z.number().optional(), netRevenue: z.number().optional(), netAov: z.number().optional(), timezone: z.string().optional() })
    .optional()
});

const marketingCommandSchema = baseSnapshotSchema.extend({
  actions: z
    .array(
      z.object({
        title: z.string(),
        metric: z.string(),
        detail: z.string()
      })
    )
    .optional(),
  status: z.string().optional(),
  whatMatters: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  sourceFreshnessSummary: z
    .array(
      z.object({
        source: z.string(),
        hoursSince: z.number().optional(),
        stale: z.boolean().optional(),
        thresholdHours: z.number().optional()
      })
    )
    .optional()
});

const supportedKeys = ["product_conversion", "website", "marketing_command"] as const;
export type SupportedSnapshotKey = (typeof supportedKeys)[number];

function isSupportedKey(key: string): key is SupportedSnapshotKey {
  return (supportedKeys as readonly string[]).includes(key);
}

function metricImpliesMetaAttribution(metric: string): boolean {
  return metric.startsWith("meta_") || metric.includes("meta");
}

export function snapshotToFusionCandidates(input: {
  nowIso: string;
  snapshot: DashboardSnapshotRecord;
  blockedDomains: string[];
}): {
  candidates: FusionCandidate[];
  freshness: { key: string; generated_at: string | null; age_days: number | null; classification: SnapshotFreshnessClass };
  skipped_reason: string | null;
} {
  const key = input.snapshot.key;
  if (!isSupportedKey(key)) {
    return {
      candidates: [],
      freshness: { key, generated_at: input.snapshot.generated_at, age_days: null, classification: "stale" },
      skipped_reason: "unsupported_snapshot_key"
    };
  }

  if (!input.snapshot.generated_at) {
    return {
      candidates: [],
      freshness: { key, generated_at: null, age_days: null, classification: "stale" },
      skipped_reason: "missing_generated_at"
    };
  }

  const age_days = daysBetween(input.nowIso, input.snapshot.generated_at);
  const freshnessClass = classifyFreshness({ snapshotKey: key, ageDays: age_days });
  const freshness = { key, generated_at: input.snapshot.generated_at, age_days, classification: freshnessClass };

  if (freshnessClass === "stale") {
    return { candidates: [], freshness, skipped_reason: "stale_snapshot" };
  }

  const payload = input.snapshot.payload;
  if (!payload || typeof payload !== "object") {
    return { candidates: [], freshness, skipped_reason: "invalid_payload" };
  }

  const payloadObj = payload as Record<string, unknown>;
  const status = (payloadObj.status as string | undefined) ?? input.snapshot.mode ?? null;
  if (typeof status === "string" && status.toUpperCase() === "UNAVAILABLE") {
    return { candidates: [], freshness, skipped_reason: "snapshot_unavailable" };
  }

  const blockedMeta = input.blockedDomains.includes("meta_attribution");

  // Key-specific parsing and candidate mapping.
  if (key === "product_conversion") {
    const parsed = productConversionSchema.safeParse(payload);
    if (!parsed.success) return { candidates: [], freshness, skipped_reason: "unknown_schema" };
    const rows = parsed.data.rows;
    const top = rows.find((r) => typeof r.recommendedAction === "string" && r.recommendedAction.trim().length > 0) ?? null;
    if (!top) return { candidates: [], freshness, skipped_reason: "no_action" };

    const confidenceLevel = top.confidence ?? "medium";
    const confLevel =
      confidenceLevel === "high"
        ? ("strongly_supported" as const)
        : confidenceLevel === "medium"
          ? ("likely" as const)
          : ("possible" as const);
    const conf = {
      system: "explanation_confidence" as const,
      level: confLevel,
      score: null,
      reasons: ["Derived from product_conversion dashboard snapshot."],
      blockers: [] as string[]
    };

    const candidate: FusionCandidate = {
      candidate_id: `prod_snapshot:${key}:${input.snapshot.generated_at}`, // stable
      candidate_type: "internal_finding_package",
      source_engine: "dashboard_snapshots",
      source_engine_version: `dashboard_snapshots:${key}`,
      linked_finding_id: null,
      linked_hypothesis_ids: [],
      linked_opportunity_id: null,
      linked_recommendation_id: null,
      recommendation_fingerprint: null,
      affected_business_domains: ["marketing", "website", "commerce"],
      affected_entities: top.productId ? [{ entity_id: String(top.productId), role: "product", entity_type: "product" }] : [],
      supporting_evidence_fact_ids: [],
      contradicting_evidence_fact_ids: [],
      missing_evidence: ["Not yet linked to intelligence_facts_v1 fact ids"],
      internal_sources_used: ["dashboard_snapshots"],
      external_signals_used: [],
      external_signals_missing: [],
      expected_mechanism: top.summary ?? null,
      blocked_domain_constraints: [],
      strategic_guardrail_violations: [],
      confidence: conf,
      urgency: freshnessClass === "fresh" ? "medium" : "low",
      risk: "low",
      value_potential_proxy: 0.4,
      information_gain_value: 0.3,
      strategic_fit: 0.8,
      relevance_expires_at: freshnessClass === "fresh" ? null : null,
      current_regime: null,
      proposed_action: {
        action_key: `promote_product:${top.productId ?? top.productName}`,
        category: "product_promotion",
        headline: `Product momentum: ${top.productName}`,
        recommended_action: top.recommendedAction ?? "",
        measurement_plan: "Measure downstream purchase conversion for this product vs baseline window.",
        success_metrics: [{ metric_id: "derived.purchase_conversion_pct", note: "Directional; requires fact-id linkage later" }],
        evaluation_window: null,
        stop_condition: "If the product does not convert after a fixed window, stop allocating prime placement.",
        review_by: null,
        reversibility: "reversible",
        estimated_effort_hours: 1,
        estimated_cost_cents: 0
      },
      evidence_edges: [],
      thesis_influence_trace: [],
      knowledge_gap_ids: [],
      scenario_ids_evaluated: [],
      resilience_score: null,
      fragile_assumptions: [],
      contingency_id: null,
      early_warning_indicators: []
    };

    return { candidates: [candidate], freshness, skipped_reason: null };
  }

  if (key === "marketing_command") {
    const parsed = marketingCommandSchema.safeParse(payload);
    if (!parsed.success) return { candidates: [], freshness, skipped_reason: "unknown_schema" };
    const actions = parsed.data.actions ?? [];
    if (!actions.length) return { candidates: [], freshness, skipped_reason: "no_action" };

    // Only map an action if it has a structured metric and is not Meta-causal when blocked.
    const mapped = [] as FusionCandidate[];
    for (const a of actions) {
      if (!a.metric || !a.title) continue;
      if (blockedMeta && metricImpliesMetaAttribution(a.metric)) {
        // Skip rather than fabricate a reframed causal claim.
        continue;
      }

      const conf = {
        system: "explanation_confidence" as const,
        level: "likely" as const,
        score: null,
        reasons: ["Derived from marketing_command dashboard snapshot."],
        blockers: []
      };
      const candidate: FusionCandidate = {
        candidate_id: `prod_snapshot:${key}:${a.metric}:${input.snapshot.generated_at}`,
        candidate_type: "internal_finding_package",
        source_engine: "dashboard_snapshots",
        source_engine_version: `dashboard_snapshots:${key}`,
        linked_finding_id: null,
        linked_hypothesis_ids: [],
        linked_opportunity_id: null,
        linked_recommendation_id: null,
        recommendation_fingerprint: null,
        affected_business_domains: ["marketing", "commerce"],
        affected_entities: [],
        supporting_evidence_fact_ids: [],
        contradicting_evidence_fact_ids: [],
        missing_evidence: ["Not yet linked to intelligence_facts_v1 fact ids"],
        internal_sources_used: ["dashboard_snapshots"],
        external_signals_used: [],
        external_signals_missing: [],
        expected_mechanism: a.detail ?? null,
        blocked_domain_constraints: [],
        strategic_guardrail_violations: [],
        confidence: conf,
        urgency: freshnessClass === "fresh" ? "high" : "medium",
        risk: "medium",
        value_potential_proxy: 0.5,
        information_gain_value: 0.4,
        strategic_fit: 0.8,
        relevance_expires_at: null,
        current_regime: null,
        proposed_action: {
          action_key: `marketing_command:${a.metric}`,
          category: "marketing_optimization",
          headline: a.title,
          recommended_action: a.detail,
          measurement_plan: "Measure primary metric vs baseline window; do not assume causality.",
          success_metrics: [{ metric_id: a.metric, note: "Directional; requires fact-id linkage later" }],
          evaluation_window: null,
          stop_condition: "If no measurable improvement after the evaluation window, stop and reassess.",
          review_by: null,
          reversibility: "reversible",
          estimated_effort_hours: 1,
          estimated_cost_cents: 0
        },
        evidence_edges: [],
        thesis_influence_trace: [],
        knowledge_gap_ids: [],
        scenario_ids_evaluated: [],
        resilience_score: null,
        fragile_assumptions: [],
        contingency_id: null,
        early_warning_indicators: []
      };
      mapped.push(candidate);
    }

    if (!mapped.length) {
      return { candidates: [], freshness, skipped_reason: blockedMeta ? "blocked_by_meta_attribution" : "no_mappable_action" };
    }

    return { candidates: mapped, freshness, skipped_reason: null };
  }

  if (key === "website") {
    const parsed = websiteSchema.safeParse(payload);
    if (!parsed.success) return { candidates: [], freshness, skipped_reason: "unknown_schema" };
    // Website snapshot does not carry a deterministic action in current shape; skip rather than infer.
    return { candidates: [], freshness, skipped_reason: "no_deterministic_action" };
  }

  return { candidates: [], freshness, skipped_reason: "unsupported_snapshot_key" };
}

export function classifyCandidateEvidence(candidate: FusionCandidate): {
  confidence01: number;
  missing_evidence_count: number;
} {
  const { normalized } = normalizeConfidenceTo01(candidate.confidence);
  return { confidence01: normalized, missing_evidence_count: candidate.missing_evidence.length };
}

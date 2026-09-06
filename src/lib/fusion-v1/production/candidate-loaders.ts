import { getDashboardSnapshots, getActiveOpportunitiesVw, type ActiveOpportunityViewRow } from "@/lib/supabase/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { snapshotToFusionCandidates } from "@/lib/fusion-v1/production/adapters/dashboard-snapshots";
import { opportunityToFusionCandidate, type OpportunityRow } from "@/lib/fusion-v1/production/adapters/opportunities";
import { trafficQualityChainToFusionCandidate, type TrafficQualityChain } from "@/lib/fusion-v1/production/adapters/traffic-quality";
import {
  type CanonicalExternalFusionContextV1
} from "@/lib/fusion-v1/production/adapters/external-knowledge";
import { type ExternalFusionContextLoadResult } from "@/lib/fusion-v1/production/external-fusion-context-loader";
import { loadExternalKnowledgeSynthesisCandidates } from "@/lib/fusion-v1/production/external-knowledge-synthesis-candidates";
import type { FusionCandidate } from "@/lib/fusion-v1/contracts";
import type { Finding, Hypothesis } from "@/lib/intelligence-v1/contracts";

export type ProductionCandidateLoadResult = {
  candidates: FusionCandidate[];
  candidate_meta_by_id: Record<string, { source: string; freshness: "fresh" | "monitor_only" }>;
  sources_inspected: string[];
  sources_empty: string[];
  sources_stale: string[];
  sources_skipped: Array<{ source: string; reason: string }>;
  freshness_notes: Array<Record<string, unknown>>;
};

export async function loadProductionFusionCandidates(input: {
  nowIso: string;
  strategic_constraints_blocked_domains: string[];
  external_fusion_contexts?: CanonicalExternalFusionContextV1[];
  external_fusion_context_loader?: (input: { nowIso: string }) => Promise<ExternalFusionContextLoadResult>;
}): Promise<ProductionCandidateLoadResult> {
  const sources_inspected: string[] = [];
  const sources_empty: string[] = [];
  const sources_stale: string[] = [];
  const sources_skipped: Array<{ source: string; reason: string }> = [];
  const freshness_notes: Array<Record<string, unknown>> = [];

  const candidates: FusionCandidate[] = [];
  const candidate_meta_by_id: Record<string, { source: string; freshness: "fresh" | "monitor_only" }> = {};

  // 1) Dashboard snapshots (whitelist)
  sources_inspected.push("dashboard_snapshots");
  const snapshotKeys = ["product_conversion", "website", "marketing_command"];
  const snapshots = await getDashboardSnapshots(snapshotKeys);
  if (!snapshots.length) sources_empty.push("dashboard_snapshots");
  for (const snap of snapshots) {
    const res = snapshotToFusionCandidates({
      nowIso: input.nowIso,
      snapshot: snap,
      blockedDomains: input.strategic_constraints_blocked_domains
    });
    freshness_notes.push({ source: "dashboard_snapshots", key: snap.key, freshness: res.freshness, skipped: res.skipped_reason });
    if (res.skipped_reason) {
      sources_skipped.push({ source: `dashboard_snapshots:${snap.key}`, reason: res.skipped_reason });
      if (res.freshness.classification === "stale") sources_stale.push(`dashboard_snapshots:${snap.key}`);
      continue;
    }
    for (const c of res.candidates) {
      candidates.push(c);
      candidate_meta_by_id[c.candidate_id] = {
        source: `dashboard_snapshots:${snap.key}`,
        freshness: res.freshness.classification === "fresh" ? "fresh" : "monitor_only"
      };
    }
  }

  // 2) Active opportunities (first-party) — primary discovery input.
  sources_inspected.push("vw_active_opportunities");
  const opps = (await getActiveOpportunitiesVw(25)) as unknown as ActiveOpportunityViewRow[];
  if (!opps.length) sources_empty.push("vw_active_opportunities");
  for (const row of opps) {
    const res = opportunityToFusionCandidate({ nowIso: input.nowIso, row: row as unknown as OpportunityRow });
    freshness_notes.push({ source: "vw_active_opportunities", opportunity_id: row.id, freshness: res.freshness, skipped: res.skipped_reason });
    if (res.skipped_reason && !res.candidate) {
      sources_skipped.push({ source: `vw_active_opportunities:${row.id}`, reason: res.skipped_reason });
      if (res.freshness.classification === "stale") sources_stale.push(`vw_active_opportunities:${row.id}`);
      continue;
    }
    if (res.candidate) candidates.push(res.candidate);
    if (res.candidate) {
      candidate_meta_by_id[res.candidate.candidate_id] = {
        source: `vw_active_opportunities:${row.id}`,
        freshness: res.freshness.classification === "fresh" ? "fresh" : "monitor_only"
      };
    }
  }

  // 3) Traffic quality mismatch chain (intelligence v1)
  sources_inspected.push("intelligence_v1_traffic_quality");
  const tq = await loadTrafficQualityMismatchChain();
  if (!tq) {
    sources_empty.push("intelligence_v1_traffic_quality");
  } else {
    const c = trafficQualityChainToFusionCandidate({ nowIso: input.nowIso, chain: tq });
    candidates.push(c);
    candidate_meta_by_id[c.candidate_id] = { source: "intelligence_v1_traffic_quality", freshness: "fresh" };
  }

  const external = await loadExternalKnowledgeSynthesisCandidates({
    nowIso: input.nowIso,
    external_fusion_contexts: input.external_fusion_contexts,
    external_fusion_context_loader: input.external_fusion_context_loader
  });
  candidates.push(...external.candidates);
  Object.assign(candidate_meta_by_id, external.candidate_meta_by_id);
  sources_inspected.push(...external.sources_inspected);
  sources_empty.push(...external.sources_empty);
  sources_stale.push(...external.sources_stale);
  sources_skipped.push(...external.sources_skipped);
  freshness_notes.push(...external.freshness_notes);

  return { candidates, candidate_meta_by_id, sources_inspected, sources_empty, sources_stale, sources_skipped, freshness_notes };
}

async function loadTrafficQualityMismatchChain(): Promise<TrafficQualityChain | null> {
  // Conservative: require a complete chain.
  const supabase = getSupabaseServerClient();

  const findingRes = await supabase
    .from("intelligence_findings_v1")
    .select("*")
    .eq("detector_id", "traffic_quality_mismatch_v1")
    .order("created_at", { ascending: false })
    .limit(1);
  if (findingRes.error) throw findingRes.error;
  const finding = (findingRes.data?.[0] as unknown as Record<string, unknown> | undefined) ?? null;
  if (!finding) return null;

  const hypothesesRes = await supabase
    .from("intelligence_hypotheses_v1")
    .select("*")
    .eq("finding_id", String(finding.finding_id ?? ""));
  if (hypothesesRes.error) throw hypothesesRes.error;
  const hypotheses = (hypothesesRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  if (hypotheses.length < 3) return null;

  const recRes = await supabase
    .from("intelligence_recommendations_v1")
    .select("*")
    .eq("finding_id", String(finding.finding_id ?? ""))
    .order("created_at", { ascending: false })
    .limit(1);
  if (recRes.error) throw recRes.error;
  const rec = (recRes.data?.[0] as unknown as Record<string, unknown> | undefined) ?? null;
  if (!rec) return null;

  // Evidence edges are required for traceability and must reference persisted fact ids.
  const edgesRes = await supabase
    .from("intelligence_evidence_edges_v1")
    .select("from_type,from_id,to_type,to_id,relation")
    .eq("from_type", "finding")
    .eq("from_id", String(finding.finding_id ?? ""));
  if (edgesRes.error) throw edgesRes.error;
  const edges = (edgesRes.data ?? []) as Array<{ to_type: string; to_id: string; relation: string }>;
  const fact_ids = edges.filter((e) => e.to_type === "fact").map((e) => e.to_id);
  const contradicting_fact_ids = edges.filter((e) => e.to_type === "fact" && e.relation === "contradicts").map((e) => e.to_id);
  if (!fact_ids.length) return null;

  return {
    finding: finding as unknown as Finding,
    hypotheses: hypotheses as unknown as Hypothesis[],
    recommendation: {
      recommendation_id: String(rec.recommendation_id ?? ""),
      recommendation_fingerprint: String(rec.recommendation_fingerprint ?? ""),
      action_key: String(rec.action_key ?? ""),
      recommendation_policy_version: String(rec.recommendation_policy_version ?? ""),
      recommended_action: String(rec.recommended_action ?? ""),
      measurement_plan: (rec.measurement_plan as string | null) ?? null,
      success_metrics: (rec.success_metrics as Array<{ metric_id: string; note: string | null }> | null) ?? [],
      evaluation_window: (rec.evaluation_window as { startDate: string; endDate: string } | null) ?? null,
      stop_condition: (rec.stop_condition as string | null) ?? null,
      review_by: null
    },
    fact_ids,
    contradicting_fact_ids
  };
}

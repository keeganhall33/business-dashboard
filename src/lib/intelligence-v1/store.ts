import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Finding, Hypothesis, EvidenceEdge } from "@/lib/intelligence-v1/contracts";
import { computeDimensionsHash } from "@/lib/intelligence-v1/dimensions-hash";

type SupabaseLike = ReturnType<typeof getSupabaseServerClient>;

function getClient(client?: SupabaseLike) {
  return client ?? getSupabaseServerClient();
}

export async function insertFacts(rows: Array<{
  metric_id: string;
  value: number;
  unit: string;
  business_date: string;
  window_type: string;
  dimensions: Record<string, unknown>;
  dimensions_hash?: string;
  source_system: string;
  retrieved_at: string;
  source_as_of: string | null;
  freshness_state: string | null;
  coverage_state: string | null;
  attribution_defensible: string | null;
  confidence_state: string | null;
  metric_definition_version: string;
}>) {
  if (!rows.length) return;
  const supabase = getClient();
  const normalized = rows.map((r) => ({
    ...r,
    dimensions_hash: r.dimensions_hash ?? computeDimensionsHash(r.dimensions)
  }));
  const { error } = await supabase
    .from("intelligence_facts_v1")
    .upsert(normalized, {
      onConflict: "metric_id,business_date,window_type,source_system,metric_definition_version,dimensions_hash"
    });
  if (error) throw new Error(`Failed to insert intelligence facts: ${error.message}`);
}

export async function upsertFactsAndFetchIds(
  rows: Array<{
    metric_id: string;
    value: number;
    unit: string;
    business_date: string;
    window_type: string;
    dimensions: Record<string, unknown>;
    dimensions_hash?: string;
    source_system: string;
    retrieved_at: string;
    source_as_of: string | null;
    freshness_state: string | null;
    coverage_state: string | null;
    attribution_defensible: string | null;
    confidence_state: string | null;
    metric_definition_version: string;
  }>,
  opts?: { client?: SupabaseLike }
): Promise<Array<{ metric_id: string; dimensions_hash: string; fact_id: string }>> {
  if (!rows.length) return [];
  const supabase = getClient(opts?.client);
  const normalized = rows.map((r) => ({
    ...r,
    dimensions_hash: r.dimensions_hash ?? computeDimensionsHash(r.dimensions)
  }));

  const up = await supabase.from("intelligence_facts_v1").upsert(normalized, {
    onConflict: "metric_id,business_date,window_type,source_system,metric_definition_version,dimensions_hash"
  });
  if (up.error) throw new Error(`Failed to upsert intelligence facts: ${up.error.message}`);

  // Fetch ids deterministically by the uniqueness key.
  const out: Array<{ metric_id: string; dimensions_hash: string; fact_id: string }> = [];
  for (const r of normalized) {
    const q = await supabase
      .from("intelligence_facts_v1")
      .select("fact_id,metric_id,dimensions_hash")
      .eq("metric_id", r.metric_id)
      .eq("business_date", r.business_date)
      .eq("window_type", r.window_type)
      .eq("source_system", r.source_system)
      .eq("metric_definition_version", r.metric_definition_version)
      .eq("dimensions_hash", r.dimensions_hash)
      .limit(1)
      .maybeSingle();
    if (q.error) throw new Error(`Failed to fetch fact id: ${q.error.message}`);
    if (!q.data?.fact_id) throw new Error(`Failed to fetch fact id for metric_id=${r.metric_id}`);
    out.push({
      metric_id: String(q.data.metric_id),
      dimensions_hash: String(q.data.dimensions_hash),
      fact_id: String(q.data.fact_id)
    });
  }
  return out;
}

export async function insertFinding(row: Finding) {
  const supabase = getClient();
  const { error } = await supabase.from("intelligence_findings_v1").upsert({
    finding_id: row.finding_id,
    detector_id: row.detector_id,
    engine_version: row.engine_version,
    type: row.type,
    title: row.title,
    summary: row.summary,
    analysis_window: row.window,
    materiality_score: row.materiality_score,
    false_positive_guards: row.false_positive_guards,
    missing_evidence: row.missing_evidence,
    confidence: row.confidence,
    facts_primary: row.facts_primary,
    evidence_for: row.evidence_for,
    evidence_against: row.evidence_against
  });
  if (error) throw new Error(`Failed to insert finding: ${error.message}`);
}

export async function insertHypotheses(rows: Hypothesis[]) {
  if (!rows.length) return;
  const supabase = getClient();
  const { error } = await supabase.from("intelligence_hypotheses_v1").upsert(
    rows.map((h) => ({
      hypothesis_id: h.hypothesis_id,
      finding_id: h.finding_id,
      engine_version: h.engine_version,
      statement: h.statement,
      mechanism: h.mechanism,
      predictions: h.predictions,
      tests: [h.disambiguation_test],
      missing_evidence: h.missing_evidence,
      confidence: h.confidence,
      evidence_for: h.evidence_for,
      evidence_against: h.evidence_against
    }))
  );
  if (error) throw new Error(`Failed to insert hypotheses: ${error.message}`);
}

export async function upsertRecommendation(row: {
  recommendation_id: string;
  recommendation_fingerprint: string;
  action_key: string;
  detector_id: string;
  detector_version: string;
  recommendation_policy_version: string;
  finding_id: string;
  hypothesis_ids: string[];
  opportunity_id: string;
  evidence_window: Record<string, unknown>;
  baseline_window: Record<string, unknown>;
  evaluation_window: Record<string, unknown>;
  success_metrics: Array<Record<string, unknown>>;
  success_threshold: string;
  stop_condition: string;
  what_changes_my_mind: string[];
  confidence: Record<string, unknown>;
}) {
  const supabase = getClient();
  const { error } = await supabase.from("intelligence_recommendations_v1").upsert(row, {
    onConflict: "recommendation_id"
  });
  if (error) throw new Error(`Failed to upsert recommendation: ${error.message}`);
}

export async function insertEvidenceEdges(edges: EvidenceEdge[]) {
  if (!edges.length) return;
  const supabase = getClient();
  const { error } = await supabase.from("intelligence_evidence_edges_v1").insert(
    edges.map((e) => ({
      from_type: e.from_type,
      from_id: e.from_id,
      to_type: e.to_type,
      to_id: e.to_id,
      relation: e.relation,
      weight: e.weight,
      note: e.note
    }))
  );
  if (error) throw new Error(`Failed to insert evidence edges: ${error.message}`);
}

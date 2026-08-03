import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Finding, Hypothesis, EvidenceEdge } from "@/lib/intelligence-v1/contracts";
import { computeDimensionsHash } from "@/lib/intelligence-v1/dimensions-hash";

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
  const supabase = getSupabaseServerClient();
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

export async function insertFinding(row: Finding) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("intelligence_findings_v1").upsert({
    finding_id: row.finding_id,
    detector_id: row.detector_id,
    engine_version: row.engine_version,
    type: row.type,
    title: row.title,
    summary: row.summary,
    window: row.window,
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
  const supabase = getSupabaseServerClient();
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
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("intelligence_recommendations_v1").upsert(row, {
    onConflict: "recommendation_id"
  });
  if (error) throw new Error(`Failed to upsert recommendation: ${error.message}`);
}

export async function insertEvidenceEdges(edges: EvidenceEdge[]) {
  if (!edges.length) return;
  const supabase = getSupabaseServerClient();
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

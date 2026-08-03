import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Finding, Hypothesis, Opportunity, Recommendation, EvidenceEdge } from "@/lib/intelligence-v1/contracts";

export async function insertFacts(rows: Array<{
  metric_id: string;
  value: number;
  unit: string;
  business_date: string;
  window_type: string;
  dimensions: Record<string, unknown>;
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
  const { error } = await supabase.from("intelligence_facts_v1").insert(rows);
  if (error) throw new Error(`Failed to insert intelligence facts: ${error.message}`);
}

export async function insertFinding(row: Finding) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("intelligence_findings_v1").insert({
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
  const { error } = await supabase.from("intelligence_hypotheses_v1").insert(
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

export async function insertOpportunity(row: Opportunity) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("intelligence_opportunities_v1").insert({
    opportunity_id: row.opportunity_id,
    finding_id: row.finding_id,
    hypothesis_ids: row.hypothesis_ids,
    type: row.type,
    title: row.title,
    why_now: row.why_now,
    risk_if_ignored: row.risk_if_ignored,
    missing_evidence: row.missing_evidence,
    confidence: row.confidence,
    evidence_for: row.evidence_for,
    evidence_against: row.evidence_against
  });
  if (error) throw new Error(`Failed to insert opportunity: ${error.message}`);
}

export async function insertRecommendation(row: Recommendation) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("intelligence_recommendations_v1").insert({
    recommendation_id: row.recommendation_id,
    opportunity_id: row.opportunity_id,
    finding_id: row.finding_id,
    hypothesis_id: row.hypothesis_id,
    title: row.title,
    action: row.action,
    rationale: row.rationale,
    success_metrics: row.success_metrics,
    evaluation_window: row.evaluation_window,
    stop_condition: row.stop_condition,
    what_changes_my_mind: row.what_changes_my_mind,
    confidence: row.confidence
  });
  if (error) throw new Error(`Failed to insert recommendation: ${error.message}`);
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

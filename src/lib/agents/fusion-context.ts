import "@/lib/server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type GenericRecord = Record<string, unknown>;

export type AgentFusionContext = {
  runId: string;
  generatedAt: string | null;
  selectedCandidateId: string | null;
  headline: string | null;
  recommendedAction: string | null;
  why: string | null;
  confidenceLevel: string | null;
  missingEvidence: string[];
  reviewBy: string | null;
  isDecision: boolean;
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; hint?: string; details?: string };
  const text = `${row.message ?? ""} ${row.hint ?? ""} ${row.details ?? ""}`.toLowerCase();
  return row.code === "PGRST205" || text.includes("fusion_runs_v1");
}

function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as GenericRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export async function getLatestAgentFusionContext(): Promise<AgentFusionContext | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fusion_runs_v1")
    .select("run_id,generated_at,selected_candidate_id,review_by,daily_decision_package")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  if (!data) return null;

  const decisionPackage = asRecord(data.daily_decision_package);
  const selected = asRecord(decisionPackage?.selected);
  const confidence = asRecord(selected?.confidence);
  const selectedCandidateId = asString(data.selected_candidate_id) ?? asString(selected?.candidate_id);

  return {
    runId: String(data.run_id),
    generatedAt: asString(data.generated_at),
    selectedCandidateId,
    headline: asString(selected?.headline),
    recommendedAction: asString(selected?.recommended_action),
    why: asString(selected?.why_binding_priority),
    confidenceLevel: asString(confidence?.level),
    missingEvidence: asStringArray(selected?.missing_evidence),
    reviewBy: asString(data.review_by) ?? asString(selected?.review_by),
    isDecision: Boolean(selectedCandidateId && selectedCandidateId !== "none")
  };
}

export function summarizeAgentFusionContext(context: AgentFusionContext | null) {
  if (!context) {
    return "No persisted Fusion decision is available. Do not infer an external-intelligence recommendation from raw research or news.";
  }

  if (!context.isDecision) {
    return `Fusion produced no operating decision${context.headline ? ` (${context.headline})` : ""}. Treat external/research signals as context only until evidence clears the decision gates.`;
  }

  return [
    `Fusion selected ${context.selectedCandidateId}.`,
    context.recommendedAction ? `Recommended action: ${context.recommendedAction}` : null,
    context.why ? `Why: ${context.why}` : null,
    context.confidenceLevel ? `Confidence: ${context.confidenceLevel}.` : null,
    context.missingEvidence.length ? `Missing evidence: ${context.missingEvidence.join("; ")}.` : null
  ]
    .filter(Boolean)
    .join(" ");
}

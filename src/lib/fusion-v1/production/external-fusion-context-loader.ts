import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CanonicalExternalFusionContextV1 } from "@/lib/fusion-v1/production/adapters/external-knowledge";

type ExternalFusionContextRow = {
  fusion_context_id?: string | null;
  generated_at?: string | null;
  lifecycle_status?: string | null;
  eligibility_status?: string | null;
  status?: string | null;
  payload?: unknown;
  context_payload?: unknown;
  fusion_context?: unknown;
  context_json?: unknown;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  in: (column: string, values: string[]) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => Promise<{ data: ExternalFusionContextRow[] | null; error: unknown }>;
};

type ExternalFusionContextClient = {
  from: (table: string) => QueryBuilder;
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: string; message?: string; hint?: string; details?: string };
  const text = `${row.message ?? ""} ${row.hint ?? ""} ${row.details ?? ""}`.toLowerCase();
  return row.code === "PGRST205" || text.includes("external_fusion_contexts_v1");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function contextPayload(row: ExternalFusionContextRow): unknown {
  return row.payload ?? row.context_payload ?? row.fusion_context ?? row.context_json ?? null;
}

function hasCanonicalFusionContextShape(value: unknown): value is CanonicalExternalFusionContextV1 {
  if (!isObject(value)) return false;
  return (
    typeof value.fusion_context_id === "string" &&
    typeof value.generated_at === "string" &&
    isObject(value.context_window) &&
    Array.isArray(value.finding_version_refs) &&
    Array.isArray(value.hypothesis_version_refs) &&
    Array.isArray(value.risk_version_refs) &&
    Array.isArray(value.opportunity_version_refs) &&
    isObject(value.world_model_state_version_ref) &&
    Array.isArray(value.contradiction_refs) &&
    Array.isArray(value.missing_evidence_refs) &&
    isObject(value.confidence_summary) &&
    isObject(value.freshness_summary) &&
    isObject(value.licensing_constraints) &&
    isObject(value.strategic_fit_constraints) &&
    isObject(value.provenance_bundle) &&
    isObject(value.context_policy_version) &&
    typeof value.content_hash === "string" &&
    Array.isArray(value.knowledge_objects)
  );
}

function isRawOrPreSynthesisRef(value: unknown) {
  if (!isObject(value)) return false;
  return ["signal", "evidence_reference", "claim", "event"].includes(String(value.object_type ?? ""));
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function confidenceAxisRefs(value: unknown): unknown[] {
  if (!isObject(value)) return [];
  return [...arrayValue(value.supporting_reference_ids), ...arrayValue(value.contradicting_reference_ids)];
}

function confidenceRefs(value: unknown): unknown[] {
  if (!isObject(value)) return [];
  return [
    ...confidenceAxisRefs(value.evidence),
    ...confidenceAxisRefs(value.interpretation),
    ...confidenceAxisRefs(value.business_relevance),
    ...confidenceAxisRefs(value.mechanism),
    ...confidenceAxisRefs(value.timing),
    ...confidenceAxisRefs(value.entity_resolution),
    ...confidenceAxisRefs(value.overall)
  ];
}

function knowledgeObjectRefs(value: unknown): unknown[] {
  if (!isObject(value)) return [];
  return [value.version_ref, ...arrayValue(value.contradiction_refs), ...confidenceRefs(value.confidence)];
}

function hasRawOrPreSynthesisRefs(context: CanonicalExternalFusionContextV1) {
  const contextRefs: unknown[] = [
    ...context.finding_version_refs,
    ...context.hypothesis_version_refs,
    ...context.risk_version_refs,
    ...context.opportunity_version_refs,
    context.world_model_state_version_ref,
    ...context.contradiction_refs,
    ...context.missing_evidence_refs,
    ...context.provenance_bundle.explanation_version_refs,
    ...context.provenance_bundle.input_version_refs
  ];
  const objectRefs = context.knowledge_objects.flatMap(knowledgeObjectRefs);
  return [...contextRefs, ...objectRefs].some(isRawOrPreSynthesisRef);
}

function rowIsEligible(row: ExternalFusionContextRow) {
  const lifecycle = (row.lifecycle_status ?? row.status ?? "").toLowerCase();
  const eligibility = (row.eligibility_status ?? "").toLowerCase();
  if (lifecycle && !["active", "eligible", "published", "current"].includes(lifecycle)) return false;
  if (eligibility && !["eligible", "active", "published"].includes(eligibility)) return false;
  return true;
}

export async function loadLatestCanonicalExternalFusionContexts(input: {
  limit?: number;
  client?: ExternalFusionContextClient;
} = {}): Promise<CanonicalExternalFusionContextV1[]> {
  const limit = input.limit ?? 3;
  const client = input.client ?? (getSupabaseServerClient() as unknown as ExternalFusionContextClient);
  const { data, error } = await client
    .from("external_fusion_contexts_v1")
    .select("fusion_context_id,generated_at,lifecycle_status,eligibility_status,status,payload,context_payload,fusion_context,context_json")
    .in("lifecycle_status", ["active", "eligible", "published", "current"])
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return (data ?? [])
    .filter(rowIsEligible)
    .map(contextPayload)
    .filter(hasCanonicalFusionContextShape)
    .filter((context) => !hasRawOrPreSynthesisRefs(context));
}

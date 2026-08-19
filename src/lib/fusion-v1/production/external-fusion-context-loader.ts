import type { CanonicalExternalFusionContextV1 } from "@/lib/fusion-v1/production/adapters/external-knowledge";

export type ExternalFusionContextLoadResult = {
  contexts: CanonicalExternalFusionContextV1[];
  unavailable: boolean;
  source: string;
  inspected_at: string;
  skipped: Array<{ id: string; reason: string }>;
};

export type ExternalFusionContextDbClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => Promise<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>;
        };
      };
    };
  };
};

type ExternalFusionContextRow = {
  fusion_context_id?: unknown;
  content_hash?: unknown;
  generated_at?: unknown;
  lifecycle_status?: unknown;
  payload_json?: unknown;
};

const SOURCE = "external_knowledge_synthesis";
const TABLE = "external_fusion_contexts_v1";
const ACTIVE_LIFECYCLE = new Set(["active", "corroborated", "supported"]);

function isMissingRelationError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /\b(42P01|PGRST205)\b|does not exist|Could not find the table|schema cache/i.test(text);
}

function isContextPayload(value: unknown): value is CanonicalExternalFusionContextV1 {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<CanonicalExternalFusionContextV1>;
  return typeof obj.fusion_context_id === "string" &&
    typeof obj.generated_at === "string" &&
    Array.isArray(obj.finding_version_refs) &&
    Array.isArray(obj.hypothesis_version_refs) &&
    Array.isArray(obj.risk_version_refs) &&
    Array.isArray(obj.opportunity_version_refs) &&
    Boolean(obj.world_model_state_version_ref) &&
    Boolean(obj.provenance_bundle) &&
    Boolean(obj.context_policy_version) &&
    typeof obj.content_hash === "string" &&
    Array.isArray(obj.knowledge_objects);
}

function normalizeRow(row: ExternalFusionContextRow): { context: CanonicalExternalFusionContextV1 | null; skipped: { id: string; reason: string } | null } {
  const id = String(row.fusion_context_id ?? "unknown");
  const lifecycle = String(row.lifecycle_status ?? "");
  if (!ACTIVE_LIFECYCLE.has(lifecycle)) return { context: null, skipped: { id, reason: `ineligible_lifecycle:${lifecycle || "missing"}` } };
  if (!isContextPayload(row.payload_json)) return { context: null, skipped: { id, reason: "invalid_or_raw_fusion_context_payload" } };
  if (row.content_hash && String(row.content_hash) !== row.payload_json.content_hash) {
    return { context: null, skipped: { id, reason: "content_hash_mismatch" } };
  }
  if (row.fusion_context_id && String(row.fusion_context_id) !== row.payload_json.fusion_context_id) {
    return { context: null, skipped: { id, reason: "fusion_context_id_mismatch" } };
  }
  return { context: row.payload_json, skipped: null };
}

export async function loadLatestEligibleExternalFusionContexts(input: {
  nowIso: string;
  limit?: number;
  client?: ExternalFusionContextDbClient;
}): Promise<ExternalFusionContextLoadResult> {
  const client = input.client ?? (await import("@/lib/supabase/server")).getSupabaseServerClient() as unknown as ExternalFusionContextDbClient;
  const query = await client
    .from(TABLE)
    .select("fusion_context_id,content_hash,generated_at,lifecycle_status,payload_json")
    .eq("lifecycle_status", "active")
    .order("generated_at", { ascending: false })
    .limit(input.limit ?? 5);

  if (query.error) {
    if (isMissingRelationError(query.error)) {
      return { contexts: [], unavailable: true, source: SOURCE, inspected_at: input.nowIso, skipped: [{ id: TABLE, reason: "canonical_external_fusion_context_store_unavailable" }] };
    }
    throw new Error(`Failed to load external FusionContexts: ${query.error.message ?? query.error.code ?? "unknown_error"}`);
  }

  const contexts: CanonicalExternalFusionContextV1[] = [];
  const skipped: ExternalFusionContextLoadResult["skipped"] = [];
  for (const row of (query.data ?? []) as ExternalFusionContextRow[]) {
    const normalized = normalizeRow(row);
    if (normalized.context) contexts.push(normalized.context);
    if (normalized.skipped) skipped.push(normalized.skipped);
  }
  return { contexts, unavailable: false, source: SOURCE, inspected_at: input.nowIso, skipped };
}

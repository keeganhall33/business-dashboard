#!/usr/bin/env node
/*
Read-only production counts (External Intelligence).

Safety contract:
- Requires OPERATOR_ENVIRONMENT=production
- Uses Supabase service_role key
- Performs ZERO writes

Run:
OPERATOR_ENVIRONMENT=production op run --env-file .env.woo.ci -- pnpm tsx scripts/read-only-external-intelligence-counts-v1.ts
*/

import assert from "node:assert";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROGRAM_SURFACE_PREDICATES = [
  "operates_event_program",
  "runs_partner_activations",
  "offers_vip_hospitality",
  "runs_relationship_recognition",
  "operates_physical_environment",
  "runs_philanthropy_program",
  "operates_merchandising",
  "operates_licensing",
  "operates_retail_distribution",
  "runs_art_culture_design_program",
  "runs_commemoration_program"
] as const;

function redactedHost(url: string) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "<unknown>";
  }
}

type AnySupabaseClient = SupabaseClient;

async function countTable(supabase: AnySupabaseClient, table: string) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countProgramSurfacePredicate(supabase: AnySupabaseClient, predicate: string) {
  const { count, error } = await supabase
    .from("external_claim_versions_v1")
    .select("claim_id", { count: "exact", head: true })
    .filter("payload_json->>predicate", "eq", predicate);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  assert(process.env.OPERATOR_ENVIRONMENT === "production", "precondition_failed:OPERATOR_ENVIRONMENT must be 'production'");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "missing_supabase_env");

  // Guard against wrong target.
  assert(
    url.includes("ibjsjosplgbqevmnvvpf.supabase.co"),
    "precondition_failed:unexpected_supabase_project_ref (expected ibjsjosplgbqevmnvvpf)"
  );

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const counts = {
    supabase_host: redactedHost(url),
    EvidenceReferences: await countTable(supabase, "external_evidence_references_v1"),
    EvidenceVersions: await countTable(supabase, "external_evidence_reference_versions_v1"),
    Claims: await countTable(supabase, "external_claims_v1"),
    ClaimVersions: await countTable(supabase, "external_claim_versions_v1"),
    ProvenanceEdges: await countTable(supabase, "external_provenance_edges_v1"),
    Events: await countTable(supabase, "external_events_v1"),
    EventVersions: await countTable(supabase, "external_event_versions_v1"),
    EventClaimLinks: await countTable(supabase, "external_event_claim_links_v1")
  };

  const programSurfaceCounts: Record<string, number> = {};
  for (const p of PROGRAM_SURFACE_PREDICATES) {
    programSurfaceCounts[p] = await countProgramSurfacePredicate(supabase, p);
  }

  console.log(
    JSON.stringify(
      {
        mode: "read_only_counts",
        counts,
        program_surface_predicate_counts: programSurfaceCounts,
        program_surface_total: Object.values(programSurfaceCounts).reduce((a, b) => a + b, 0)
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("counts failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});

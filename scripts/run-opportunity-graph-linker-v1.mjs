/*
  Deterministic Opportunity ↔ Intelligence Graph linker (V1).

  - Reads from: opportunity_pipeline, external_claim_versions_v1 (optional)
  - Writes to: opportunity_graph_links_v1 (if present)

  This is a foundation step: no deep research.
*/

import { createClient } from "@supabase/supabase-js";
import { linkOpportunityToGraph } from "../src/lib/opportunity-graph-linker-v1/linker.ts";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.REACT_APP_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: opportunities, error: oppErr } = await supabase
    .from("opportunity_pipeline")
    .select("id,name,organization,notes_md,source,status")
    .not("status", "in", "(won,lost)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (oppErr) throw oppErr;

  let claimVersions = [];
  try {
    const { data: claimRows, error: claimErr } = await supabase
      .from("external_claim_versions_v1")
      .select("claim_id,content_hash,payload_json,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (claimErr) throw claimErr;
    claimVersions = claimRows ?? [];
  } catch {
    claimVersions = [];
  }

  const allLinks = [];
  for (const opp of opportunities ?? []) {
    const links = linkOpportunityToGraph({ opportunity: opp, claimVersions });
    for (const link of links) allLinks.push(link);
  }

  // Upsert if the table exists.
  try {
    // Best-effort: delete existing non-explicit links for these opportunities, then upsert.
    const oppIds = Array.from(new Set((opportunities ?? []).map((o) => o.id)));
    if (oppIds.length) {
      await supabase
        .from("opportunity_graph_links_v1")
        .delete()
        .in("opportunity_id", oppIds)
        .neq("match_method", "explicit_id");
    }

    if (allLinks.length) {
      const { error: upsertErr } = await supabase
        .from("opportunity_graph_links_v1")
        .upsert(allLinks, {
          onConflict: "opportunity_id,target_type,target_id,target_content_hash,role,match_method"
        });
      if (upsertErr) throw upsertErr;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Note: did not write opportunity_graph_links_v1 (${msg}).`);
  }

  console.log(`Opportunities scanned: ${(opportunities ?? []).length}`);
  console.log(`Claim versions scanned: ${claimVersions.length}`);
  console.log(`Links generated: ${allLinks.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


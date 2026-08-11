/*
  Opportunity Evidence Bootstrap V1 (read-only).
  Produces deterministic coverage profiles + prioritized research questions.

  No deep research performed.
*/

import { createClient } from "@supabase/supabase-js";
import { buildCoverageProfile } from "../src/lib/opportunity-evidence-bootstrap-v1/coverage.ts";
import { buildResearchQuestionsV1 } from "../src/lib/opportunity-evidence-bootstrap-v1/questions.ts";
import { applyResearchMemoryGate } from "../src/lib/opportunity-evidence-bootstrap-v1/memory.ts";

function mustEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.REACT_APP_SUPABASE_URL;
  const supabaseServiceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: opportunities, error: oppErr } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .not("status", "in", "(won,lost,parked)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (oppErr) throw oppErr;

  // Rollups are optional; linker may still be empty.
  const oppIds = (opportunities ?? []).map((o) => o.id);
  const { data: rollups } = await supabase
    .from("vw_opportunity_graph_rollup_v1")
    .select("opportunity_id,links,link_count,supported_claim_count,supported_event_count,trigger_signal_count")
    .in("opportunity_id", oppIds);
  const rollupByOpp = new Map((rollups ?? []).map((r) => [r.opportunity_id, r]));

  // Research memory is optional (table may not exist yet).
  let memoryRecords = [];
  try {
    const { data } = await supabase
      .from("opportunity_research_memory_v1")
      .select("opportunity_id,question_id,status,last_attempted_at,answer_summary,supporting_refs,ceiling_reason")
      .in("opportunity_id", oppIds);
    memoryRecords = data ?? [];
  } catch {
    memoryRecords = [];
  }

  const results = [];
  for (const opp of opportunities ?? []) {
    const profile = buildCoverageProfile({ pipeline: opp, rollup: rollupByOpp.get(opp.id) ?? null });
    const questions = buildResearchQuestionsV1(profile);
    const gated = applyResearchMemoryGate({ questions, memoryRecords });
    results.push({
      opportunity_id: profile.opportunity_id,
      name: profile.opportunity_name,
      summaryCounts: profile.summaryCounts,
      biggest_gap: gated[0]?.variable ?? null,
      top_question: gated[0] ?? null
    });
  }

  console.log(JSON.stringify({ active: (opportunities ?? []).length, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


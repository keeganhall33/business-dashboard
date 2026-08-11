/*
  Local operator script.

  Goal: deterministic discovery + preliminary valuation snapshot.
  - Reads only existing production tables.
  - Does NOT do deep research.

  Usage:
    node scripts/run-opportunity-discovery-v2.mjs
*/

import { createClient } from "@supabase/supabase-js";
import { buildOpportunityCandidatesV2 } from "../src/lib/opportunity-discovery-v2/discovery.ts";

function money(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.REACT_APP_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: pipelineRowsRaw, error: pipelineError } = await supabase
    .from("opportunity_pipeline")
    .select("*")
    .not("status", "in", "(won,lost,parked)")
    .order("created_at", { ascending: false })
    .limit(250);
  if (pipelineError) throw pipelineError;

  const { data: relationshipsRaw, error: relError } = await supabase
    .from("collector_relationships")
    .select("id,collector_name,tier,estimated_value,next_move,next_move_due_at,notes")
    .order("tier", { ascending: true })
    .order("priority", { ascending: false })
    .limit(120);
  if (relError) throw relError;

  // External candidates: prefer industry_pulse_opportunities; fall back to featured industry_news_articles.
  const { data: pulseRows, error: pulseError } = await supabase
    .from("industry_pulse_opportunities")
    .select("id,day,source,headline,summary,collab_idea,why_now,source_url")
    .order("day", { ascending: false })
    .limit(25);

  let externalCandidates;
  if (!pulseError && Array.isArray(pulseRows) && pulseRows.length) {
    externalCandidates = pulseRows.map((row) => ({
      id: row.id,
      headline: row.headline,
      source: row.source,
      summary: row.summary,
      whyNow: row.why_now,
      collabIdea: row.collab_idea,
      sourceUrl: row.source_url,
      day: row.day,
      organizationHint: null
    }));
  } else {
    const { data: featuredRows, error: featuredError } = await supabase
      .from("industry_news_articles")
      .select("id,featured_date,source_name,title,summary,collab_concept,why_now,url")
      .not("featured_date", "is", null)
      .order("featured_date", { ascending: false })
      .order("featured_rank", { ascending: true })
      .limit(25);
    if (featuredError) throw featuredError;
    externalCandidates = (featuredRows ?? []).map((row) => ({
      id: row.id,
      headline: row.title,
      source: row.source_name,
      summary: row.summary,
      whyNow: row.why_now,
      collabIdea: row.collab_concept,
      sourceUrl: row.url,
      day: row.featured_date,
      organizationHint: null
    }));
  }

  const pipelineRows = pipelineRowsRaw ?? [];
  const relationships = relationshipsRaw ?? [];

  const candidates = buildOpportunityCandidatesV2({
    pipelineRows,
    externalCandidates,
    relationships
  });

  const top = candidates.slice(0, 10);
  console.log(`Active pipeline opportunities: ${pipelineRows.length}`);
  console.log(`External candidates (industry pulse): ${externalCandidates.length}`);
  console.log(`Ranked candidates: ${candidates.length}`);
  console.log("\nTop 10:\n");

  for (let i = 0; i < top.length; i += 1) {
    const c = top[i];
    const v = c.valuation;
    console.log(
      `${i + 1}. ${c.seed.name} | score ${c.overallScore.toFixed(1)} | ${money(v.low)}/${money(v.base)}/${money(v.high)} | conf ${v.confidence.toFixed(
        2
      )} | ${c.bestArchetype ?? "—"} | ${c.recommendation}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

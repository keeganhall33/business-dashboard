#!/usr/bin/env tsx
/**
 * Debug: Opportunity discovery selector v2 snapshot.
 *
 * - Reads vw_active_opportunities (first-party) and shows deterministic ranking factors.
 * - Does not mutate DB.
 */

import { execFileSync } from "node:child_process";

import { scoreOpportunitySelectorV2, type OpportunityRow } from "@/lib/fusion-v1/production/adapters/opportunities";

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const sql =
    "select id,name,organization,opportunity_type,status,value_estimate,prestige_score,probability_score,owner_agent,contact_name,contact_role,next_step,updated_at,created_at from vw_active_opportunities order by updated_at desc limit 100;";
  const raw = execFileSync(
    "supabase",
    ["db", "query", "--linked", "--output", "json", sql],
    { encoding: "utf8" }
  );

  const rows = (JSON.parse(raw) as unknown[]) as OpportunityRow[];

  const scored = rows
    .map((r) => {
      const row: OpportunityRow = {
        ...r,
        value_estimate: toNumber((r as any).value_estimate),
        prestige_score: toNumber((r as any).prestige_score),
        probability_score: toNumber((r as any).probability_score)
      } as any;
      const s = scoreOpportunitySelectorV2(row);
      return { row, ...s };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // weak tie-breaker: most recently updated wins
      const at = Date.parse(a.row.updated_at ?? a.row.created_at);
      const bt = Date.parse(b.row.updated_at ?? b.row.created_at);
      if (bt !== at) return bt - at;
      return String(a.row.id).localeCompare(String(b.row.id));
    });

  console.log(
    JSON.stringify(
      {
        candidate_count: scored.length,
        top10: scored.slice(0, 10).map((x) => ({
          id: x.row.id,
          name: x.row.name,
          organization: x.row.organization,
          opportunity_type: x.row.opportunity_type,
          status: x.row.status,
          score: x.score,
          factors: x.factors,
          value_estimate: x.row.value_estimate,
          prestige_score: x.row.prestige_score,
          probability_score: x.row.probability_score,
          contact: x.row.contact_name ? { name: x.row.contact_name, role: x.row.contact_role } : null,
          next_step: x.row.next_step,
          updated_at: x.row.updated_at
        }))
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("debug-opportunity-discovery-selector-v2 failed", { error: e?.message ?? String(e) });
  process.exitCode = 1;
});

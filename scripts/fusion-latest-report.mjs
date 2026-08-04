#!/usr/bin/env node

/*
  Read-only operator report for Fusion v1.
  - Uses supabase CLI (--linked) for access (no secrets printed).
  - Mutates nothing.
*/

import { execFileSync } from "node:child_process";

function query(sql) {
  const out = execFileSync(
    "supabase",
    ["db", "query", "--linked", "--output", "json", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out);
}

const latest = query(
  "select run_id, generated_at, run_status, execution_mode, candidate_total_count, candidate_eligible_count, independent_cluster_count, selected_candidate_id, next_review_at from fusion_runs_v1 order by generated_at desc limit 1;"
);

if (!latest.length) {
  console.log("No fusion_runs_v1 rows yet.");
  process.exit(0);
}

const run = latest[0];
console.log("Fusion latest run:");
console.log(JSON.stringify(run, null, 2));

const top = query(
  `select candidate_id, rank, final_score from fusion_rankings_v1 where run_id='${run.run_id}' order by rank asc limit 5;`
);
if (top.length) {
  console.log("\nTop ranked candidates:");
  console.log(JSON.stringify(top, null, 2));
}


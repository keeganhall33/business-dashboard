import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("fusion migration guard: rollback order is dependency-safe and no reserved identifiers used", () => {
  const fwd = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260803_add_fusion_v1_tables.sql"), "utf8");
  const rb = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260803_add_fusion_v1_tables.rollback.sql"),
    "utf8"
  );

  // Reserved-word quick scan: do not define an unquoted `window` column.
  assert.equal(/\n\s*window\s+/i.test(fwd), false);

  // Rollback should drop child tables before parent.
  const idxRank = rb.indexOf("drop table if exists fusion_rankings_v1");
  const idxCand = rb.indexOf("drop table if exists fusion_candidates_v1");
  const idxRuns = rb.indexOf("drop table if exists fusion_runs_v1");
  assert.ok(idxRank !== -1 && idxCand !== -1 && idxRuns !== -1);
  assert.ok(idxRank < idxCand && idxCand < idxRuns);

  // Uniqueness key should include the declared onConflict key fields.
  assert.ok(/unique\(input_set_fingerprint,\s*fusion_policy_version,\s*fusion_score_version,\s*strategic_constraints_hash\)/i.test(fwd));
});


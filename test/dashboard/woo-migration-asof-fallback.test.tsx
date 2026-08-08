import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("woo get_woo_metrics migration uses provider asOf with completed_at fallback (no fabricated timestamps)", () => {
  const sql = fs.readFileSync("supabase/migrations/20260803010300_get_woo_metrics_asof_fallback.sql", "utf8");

  assert.match(sql, /coalesce\(\s*\(select source_as_of_gmt from latest_run\),\s*\(select completed_at from latest_run\)\s*\)/i);
  // Guardrails: no render-time / deployment-time fallback introduced.
  assert.ok(!/current_timestamp/i.test(sql));
  assert.ok(!/render/i.test(sql));
});

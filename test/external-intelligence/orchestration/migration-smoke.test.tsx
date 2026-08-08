import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("b2 migrations exist", () => {
  const fwd = fs.readFileSync(
    "supabase/migrations/20260805010000_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );
  const rb = fs.readFileSync(
    "supabase/rollbacks/20260805_external_intelligence_phase_b2_orchestration.sql",
    "utf8"
  );

  assert.ok(fwd.includes("external_collection_schedules_v1"));
  assert.ok(fwd.includes("sports_milestone_alerts_v1"));
  assert.ok(rb.includes("drop table if exists public.external_collection_schedules_v1"));
});

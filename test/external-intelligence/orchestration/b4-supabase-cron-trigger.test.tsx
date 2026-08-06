import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION = "supabase/migrations/20260806100500_b4_supabase_cron_scheduler_tick.sql";

test("b4.3 supabase cron migration: defines one canonical 5-minute POST to /api/scheduler/tick with bearer auth", () => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8");

  assert.match(raw, /production-scheduler-tick-v1/);
  assert.match(raw, /\*\/5 \* \* \* \*/);
  assert.match(raw, /https:\/\/mission\.keeganhall\.com\/api\/scheduler\/tick/);
  assert.match(raw, /Authorization', 'Bearer '\s*\|\|\s*v_secret/);

  // Guard: no query-string auth.
  assert.ok(!raw.includes("?"));

  // Guard: no handler/source/heartbeat-specific literals.
  assert.ok(!raw.includes("external-intelligence-heartbeat"));
  assert.ok(!raw.includes("external-source-watchdog-v1"));
  assert.ok(!raw.includes("milestone-horizon-scan-v1"));

  // Guard: no plaintext secret literal should appear.
  assert.ok(!raw.includes("Bearer sk-"));
});

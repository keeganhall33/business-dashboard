import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION = "supabase/migrations/20260806100500_b4_supabase_cron_scheduler_tick.sql";

test("b4.3 supabase cron migration: secure cron trigger contract", () => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8");

  // Identity + cadence + route.
  assert.match(raw, /production-scheduler-tick-v1/);
  assert.match(raw, /\*\/5 \* \* \* \*/);
  assert.match(raw, /https:\/\/mission\.keeganhall\.com\/api\/scheduler\/tick/);

  // Function security.
  assert.match(raw, /security definer/i);
  assert.match(raw, /set search_path = public/i);

  // Vault contract.
  assert.match(raw, /vault\.decrypted_secrets/);
  assert.match(raw, /name = 'scheduler_secret'/);
  assert.match(raw, /scheduler_secret_unavailable/);

  // Must not embed secrets or use query-string auth.
  assert.ok(!raw.includes("?"));
  assert.ok(!raw.includes("Bearer sk-"));

  // Must not include handler/source/heartbeat literals.
  assert.ok(!raw.includes("external-intelligence-heartbeat"));
  assert.ok(!raw.includes("external-source-watchdog-v1"));
  assert.ok(!raw.includes("milestone-horizon-scan-v1"));

  // True cron idempotency: unschedule existing jobs by name before scheduling.
  assert.match(raw, /for v_job in \(\s*\n\s*select jobid from cron\.job where jobname = 'production-scheduler-tick-v1'/);
  assert.match(raw, /cron\.unschedule/);

  // Command literal must be isolated (no nested $$ collision) and must remain exact.
  assert.ok(!raw.includes("command := $$"));
  assert.match(raw, /command := 'select public\.run_production_scheduler_tick_v1\(\);'/);

  // Async HTTP observability: capture request id from net.http_post.
  assert.match(raw, /select net\.http_post\(/);
  assert.match(raw, /into v_request_id/);
});

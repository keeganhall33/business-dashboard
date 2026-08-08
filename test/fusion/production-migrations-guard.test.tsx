import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("fusion production migrations: run status columns and scheduler job registration are narrow and rollback-safe", () => {
  const fwdStatus = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260804010100_fusion_runs_v1_status_fields.sql"), "utf8");
  const rbStatus = fs.readFileSync(
    path.join(process.cwd(), "supabase/rollbacks/20260804_fusion_runs_v1_status_fields.sql"),
    "utf8"
  );
  const fwdJob = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260804010000_add_fusion_daily_decision_job.sql"), "utf8");
  const rbJob = fs.readFileSync(
    path.join(process.cwd(), "supabase/rollbacks/20260804_add_fusion_daily_decision_job.sql"),
    "utf8"
  );

  // No unquoted reserved identifier `window`.
  assert.equal(/\n\s*window\s+/i.test(fwdStatus), false);
  assert.equal(/\n\s*window\s+/i.test(fwdJob), false);

  // Rollbacks should be present and include inverse operations.
  assert.ok(rbStatus.includes("drop column"));
  assert.ok(rbJob.includes("delete from scheduled_jobs"));

  // Job migration should only touch the single job_key.
  assert.ok(fwdJob.includes("fusion-daily-decision-v1"));
});

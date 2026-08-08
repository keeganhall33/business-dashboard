// Disposable localhost-only PostgreSQL validation for Phase B2.
// No production connections.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    ...opts
  });
  if (res.status !== 0) {
    const err = `${cmd} ${args.join(" ")}\n${res.stdout}\n${res.stderr}`;
    throw new Error(err);
  }
  return res.stdout.trim();
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "b2pg-"));
const dataDir = path.join(tmp, "data");
const port = String(55000 + Math.floor(Math.random() * 1000));

try {
  sh("initdb", ["-D", dataDir, "-A", "trust", "-U", "postgres"]);

  sh("pg_ctl", [
    "-D",
    dataDir,
    "-o",
    `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off`,
    "-w",
    "start"
  ]);

  const psql = (args) => sh("psql", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", ...args]);

  psql(["-c", "create database b2test;"]);

  const psqlDb = (args) => psql(["-d", "b2test", ...args]);

  // Apply prerequisite migrations: A5 then A6.1 then B2.
  const migrationsDir = path.resolve("supabase/migrations");
  const a5 = path.join(migrationsDir, "20260804010200_external_intelligence_phase_a5.sql");
  const a61 = path.join(migrationsDir, "20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
  const b2 = path.join(migrationsDir, "20260805010000_external_intelligence_phase_b2_orchestration.sql");
  const b2rb = path.join(process.cwd(), "supabase/rollbacks/20260805_external_intelligence_phase_b2_orchestration.sql");

  psqlDb(["-f", a5]);
  psqlDb(["-f", a61]);
  psqlDb(["-f", b2]);

  // Rerun safety.
  psqlDb(["-f", b2]);

  // Lease concurrency (single process, deterministic): second lease should return no rows.
  psqlDb([
    "-c",
    "insert into public.external_collection_schedules_v1(schedule_id,source_id,source_config_version,registry_hash,source_sets_hash,eligibility_fingerprint,schedule_policy_version,cadence_type,cadence_interval_seconds,timezone,preferred_window_json,freshness_sla_seconds,maximum_staleness_seconds,timeout_seconds,maximum_attempts,backoff_policy_json,rate_limit_budget_json,concurrency_key,priority,enabled,collection_mode,environment,review_by) values ('sch','economics.fred','v1.0.0',repeat('a',64),repeat('b',64),repeat('c',64),'v1.0.0','daily',86400,'UTC','{}',86400,86400,20,0,'{}','{}','ck','low',true,'automated','local','ops') on conflict do nothing;"
  ]);
  psqlDb([
    "-c",
    "insert into public.external_collection_jobs_v1(job_id,schedule_id,source_id,collection_plan_id,planned_for,run_after,status,maximum_attempts,input_fingerprint,idempotency_key,concurrency_key) values ('job1','sch','economics.fred','plan','2026-08-05T00:00:00Z','2026-08-05T00:00:00Z','queued',0,repeat('d',64),'job1','ck') on conflict do nothing;"
  ]);

  const lease1 = psqlDb([
    "-c",
    "select * from public.lease_external_collection_job_v1('w1', 60, 10, 1);"
  ]);
  const lease2 = psqlDb([
    "-c",
    "select * from public.lease_external_collection_job_v1('w2', 60, 10, 1);"
  ]);
  if (!lease1.includes("job1")) throw new Error("lease1 did not lease job1");
  if (lease2.trim() !== "") throw new Error("lease2 unexpectedly leased a job");

  // Milestone persistence: first insert, replay, conflict.
  const payload1 = "{" +
    "\"schema_version\":\"sports_milestone_v1\"," +
    "\"milestone_id\":\"m1\"," +
    "\"milestone_type\":\"championship_anniversary\"," +
    "\"milestone_date\":\"2027-06-03\"" +
  "}";

  psqlDb([
    "-c",
    `select * from public.persist_sports_milestone_v1('m1', repeat('1',64), 'sports_milestone_v1', '${payload1}'::jsonb, '[{"policy_name":"confidence","semantic_version":"v1.0.0","content_hash":"${"2".repeat(64)}"}]'::jsonb, '[{"label":"x","url":"https://example.invalid"}]'::jsonb, '["calendar.sports.milestones"]'::jsonb, 'championship_anniversary', 'nba', null, 'nba', null, '2027-06-03', null, 'major_institutional_partnership', 'high', 'high', '[]'::jsonb, 'none');`
  ]);
  // replay
  psqlDb([
    "-c",
    `select * from public.persist_sports_milestone_v1('m1', repeat('1',64), 'sports_milestone_v1', '${payload1}'::jsonb, '[{"policy_name":"confidence","semantic_version":"v1.0.0","content_hash":"${"2".repeat(64)}"}]'::jsonb, '[{"label":"x","url":"https://example.invalid"}]'::jsonb, '["calendar.sports.milestones"]'::jsonb, 'championship_anniversary', 'nba', null, 'nba', null, '2027-06-03', null, 'major_institutional_partnership', 'high', 'high', '[]'::jsonb, 'none');`
  ]);

  // conflict: same hash, different payload
  let conflictOk = false;
  try {
    psqlDb([
      "-c",
      `select * from public.persist_sports_milestone_v1('m1', repeat('1',64), 'sports_milestone_v1', '{"schema_version":"sports_milestone_v1","milestone_id":"m1","milestone_type":"championship_anniversary","milestone_date":"2027-06-04"}'::jsonb, '[{"policy_name":"confidence","semantic_version":"v1.0.0","content_hash":"${"2".repeat(64)}"}]'::jsonb, '[{"label":"x","url":"https://example.invalid"}]'::jsonb, '["calendar.sports.milestones"]'::jsonb, 'championship_anniversary', 'nba', null, 'nba', null, '2027-06-04', null, 'major_institutional_partnership', 'high', 'high', '[]'::jsonb, 'none');`
    ]);
  } catch {
    conflictOk = true;
  }
  if (!conflictOk) throw new Error("expected milestone conflict");

  // Alert lifecycle: upsert + replay + preserve dismissed/ack + invalidation + expiry.
  const alertPayload = JSON.stringify([
    {
      alert_id: "a1",
      milestone_id: "m1",
      milestone_content_hash: "1".repeat(64),
      horizon_days: 30,
      policy_version: "v1.0.0",
      suppression_policy_version: "v1.0.0",
      suppression_identity: "sup1",
      alert_hash: "h1",
      project_class: "major_institutional_partnership",
      planning_stage: "draft",
      milestone_date: "2027-06-03",
      days_remaining_at_creation: 300,
      reason_codes: ["lead_time"],
      expires_at: "2026-08-06T00:00:00Z"
    }
  ]);

  const inserted1 = psqlDb([
    "-tA",
    "-c",
    `select inserted_count from public.upsert_sports_milestone_alerts_v1('${alertPayload}'::jsonb);`
  ]);
  if (inserted1.trim() !== "1") throw new Error("expected alert insert");

  const inserted2 = psqlDb([
    "-tA",
    "-c",
    `select inserted_count from public.upsert_sports_milestone_alerts_v1('${alertPayload}'::jsonb);`
  ]);
  if (inserted2.trim() !== "0") throw new Error("expected alert idempotent replay");

  const alertCount = psqlDb([
    "-tA",
    "-c",
    "select count(*) from public.sports_milestone_alerts_v1 where suppression_identity='sup1';"
  ]);
  if (alertCount.trim() !== "1") throw new Error("expected single alert row");

  // Dismissed alerts are historical and must not be reset by upsert.
  psqlDb([
    "-c",
    "update public.sports_milestone_alerts_v1 set status='dismissed', dismissed_at=now() where suppression_identity='sup1';"
  ]);
  psqlDb([
    "-c",
    `select * from public.upsert_sports_milestone_alerts_v1('${alertPayload}'::jsonb);`
  ]);
  const statusAfter = psqlDb([
    "-tA",
    "-c",
    "select status from public.sports_milestone_alerts_v1 where suppression_identity='sup1';"
  ]);
  if (statusAfter.trim() !== "dismissed") throw new Error("dismissed alert was modified by upsert");

  // Obsolete pending alerts should invalidate when milestone current pointer changes.
  psqlDb([
    "-c",
    `select * from public.persist_sports_milestone_v1('m1', repeat('3',64), 'sports_milestone_v1', '${payload1}'::jsonb, '[{"policy_name":"confidence","semantic_version":"v1.0.0","content_hash":"${"2".repeat(64)}"}]'::jsonb, '[{"label":"x","url":"https://example.invalid"}]'::jsonb, '["calendar.sports.milestones"]'::jsonb, 'championship_anniversary', 'nba', null, 'nba', null, '2027-06-03', null, 'major_institutional_partnership', 'high', 'high', '[]'::jsonb, 'none');`
  ]);

  psqlDb([
    "-c",
    "insert into public.sports_milestone_alerts_v1(alert_id,milestone_id,milestone_content_hash,horizon_days,policy_version,suppression_policy_version,suppression_identity,alert_hash,project_class,planning_stage,milestone_date,days_remaining_at_creation,status,reason_codes,expires_at) values ('a2','m1',repeat('1',64),30,'v1.0.0','v1.0.0','sup2','h2','major_institutional_partnership','draft','2027-06-03',300,'pending','{}','2026-08-06T00:00:00Z') on conflict do nothing;"
  ]);
  const inv1 = psqlDb(["-tA", "-c", "select public.invalidate_obsolete_sports_milestone_alerts_v1();"]);
  if (inv1.trim() !== "1") throw new Error("expected 1 invalidation");
  const inv2 = psqlDb(["-tA", "-c", "select public.invalidate_obsolete_sports_milestone_alerts_v1();"]);
  if (inv2.trim() !== "0") throw new Error("expected idempotent invalidation");

  // Expiry: only pending alerts at/after timestamp.
  psqlDb([
    "-c",
    "insert into public.sports_milestone_alerts_v1(alert_id,milestone_id,milestone_content_hash,horizon_days,policy_version,suppression_policy_version,suppression_identity,alert_hash,project_class,planning_stage,milestone_date,days_remaining_at_creation,status,reason_codes,expires_at) values ('a3','m1',repeat('3',64),30,'v1.0.0','v1.0.0','sup3','h3','major_institutional_partnership','draft','2027-06-03',300,'pending','{}','2026-08-05T00:00:00Z') on conflict do nothing;"
  ]);
  const exp1 = psqlDb(["-tA", "-c", "select public.expire_sports_milestone_alerts_v1('2026-08-05T12:00:00Z'::timestamptz);"]);
  if (exp1.trim() !== "1") throw new Error("expected 1 expiry");
  const exp2 = psqlDb(["-tA", "-c", "select public.expire_sports_milestone_alerts_v1('2026-08-05T12:00:00Z'::timestamptz);"]);
  if (exp2.trim() !== "0") throw new Error("expected idempotent expiry");

  // Rollback and reapply.
  psqlDb(["-f", b2rb]);
  psqlDb(["-f", b2]);

  process.stdout.write(`OK: disposable postgres validated in ${tmp}\n`);
} finally {
  try {
    sh("pg_ctl", ["-D", dataDir, "-w", "stop"]);
  } catch {
    // ignore
  }
}

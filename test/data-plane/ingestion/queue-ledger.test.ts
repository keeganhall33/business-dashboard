import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  calculateRetryDelaySeconds,
  EXECUTABLE_INGESTION_VENUES,
  INGESTION_JOB_KINDS,
  INGESTION_JOB_STATES,
  INGESTION_RUN_STATES,
  isClaimableIngestionState,
} from "../../../src/lib/data-plane/ingestion/queue-contract";

const migration = fs.readFileSync(
  "supabase/migrations/20260908070000_ingestion_queue_run_ledger_v1.sql",
  "utf8",
);
const rollback = fs.readFileSync(
  "supabase/rollbacks/20260908070000_ingestion_queue_run_ledger_v1.sql",
  "utf8",
);

test("queue and run states stay explicit and fail closed", () => {
  assert.deepEqual(INGESTION_JOB_STATES, [
    "QUEUED",
    "CLAIMED",
    "RUNNING",
    "RETRY_WAIT",
    "SUCCEEDED",
    "DEAD_LETTERED",
    "CANCELLED",
  ]);
  assert.deepEqual(INGESTION_RUN_STATES, [
    "CLAIMED",
    "RUNNING",
    "SUCCEEDED",
    "RETRY_SCHEDULED",
    "DEAD_LETTERED",
  ]);
  assert.deepEqual(INGESTION_JOB_KINDS, [
    "INCREMENTAL",
    "BACKFILL",
    "RECONCILIATION",
  ]);
  assert.deepEqual(EXECUTABLE_INGESTION_VENUES, [
    "DASHBOARD_WORKER",
    "GITHUB_ACTIONS",
    "LOCAL_AUTHORIZED_WORKER",
  ]);
  assert.equal(isClaimableIngestionState("QUEUED"), true);
  assert.equal(isClaimableIngestionState("RETRY_WAIT"), true);
  assert.equal(isClaimableIngestionState("RUNNING"), false);
});

test("retry backoff is deterministic, bounded, and rejects invalid input", () => {
  assert.equal(calculateRetryDelaySeconds({ attemptNumber: 1, baseDelaySeconds: 60, maximumDelaySeconds: 600 }), 60);
  assert.equal(calculateRetryDelaySeconds({ attemptNumber: 4, baseDelaySeconds: 60, maximumDelaySeconds: 600 }), 480);
  assert.equal(calculateRetryDelaySeconds({ attemptNumber: 8, baseDelaySeconds: 60, maximumDelaySeconds: 600 }), 600);
  assert.equal(calculateRetryDelaySeconds({ attemptNumber: 0, baseDelaySeconds: 60, maximumDelaySeconds: 600 }), null);
  assert.equal(calculateRetryDelaySeconds({ attemptNumber: 1, baseDelaySeconds: 60, maximumDelaySeconds: 30 }), null);
});

test("migration creates a private durable queue, run ledger, events, and dead letters", () => {
  for (const required of [
    "create schema if not exists ingestion_private",
    "ingestion_private.ingestion_jobs_v1",
    "ingestion_private.ingestion_runs_v1",
    "ingestion_private.ingestion_run_events_v1",
    "ingestion_private.ingestion_dead_letters_v1",
    "ingestion_jobs_v1_source_idempotency_unique",
    "ingestion_runs_v1_job_attempt_unique",
  ]) {
    assert.ok(migration.includes(required), `missing ${required}`);
  }
  assert.ok(rollback.includes("drop schema if exists ingestion_private"));
});

test("claim is atomic, due-only, capacity-safe, and fenced", () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /state in \('QUEUED', 'RETRY_WAIT'\)/);
  assert.match(migration, /j\.execution_venue = in_execution_venue/);
  assert.match(migration, /due_at <= now\(\)/);
  assert.match(migration, /ingestion_jobs_v1_one_active_per_source_idx/);
  assert.match(migration, /where state in \('CLAIMED', 'RUNNING'\)/);
  assert.match(migration, /lease_token uuid/);

  for (const fn of [
    "start_ingestion_run_v1",
    "heartbeat_ingestion_run_v1",
    "complete_ingestion_run_v1",
    "fail_ingestion_run_v1",
  ]) {
    const start = migration.indexOf(`function public.${fn}`);
    assert.ok(start >= 0, `missing ${fn}`);
    const body = migration.slice(start, migration.indexOf("$fn$;", start));
    assert.match(body, /lease_token = in_lease_token/);
  }
});

test("retries and expired leases produce bounded recovery and dead-letter evidence", () => {
  assert.match(migration, /power\(2::numeric/);
  assert.match(migration, /least\(\s*v_job.retry_max_seconds::numeric/i);
  assert.match(migration, /recover_expired_ingestion_leases_v1\(in_limit integer default 100\)/);
  assert.match(migration, /in_limit not between 1 and 1000/);
  assert.match(migration, /event_type.*'LEASE_EXPIRED'/s);
  assert.match(migration, /on conflict \(job_id\) do nothing/);
  assert.match(migration, /state = 'DEAD_LETTERED'/);
});

test("private queue has RLS and only service-role invoker RPC access", () => {
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /revoke all on schema ingestion_private from public, anon, authenticated/);
  assert.match(migration, /revoke all on all tables in schema ingestion_private from public, anon, authenticated/);
  assert.match(migration, /grant usage on schema ingestion_private to service_role/);
  assert.match(
    migration,
    /grant select, insert on ingestion_private\.ingestion_run_events_v1 to service_role/,
  );
  assert.match(
    migration,
    /grant select, insert on ingestion_private\.ingestion_dead_letters_v1 to service_role/,
  );
  assert.equal(/security definer/i.test(migration), false);

  const functions = migration.match(/create or replace function public\./g) ?? [];
  const invokers = migration.match(/security invoker/g) ?? [];
  assert.equal(functions.length, 7);
  assert.equal(invokers.length, functions.length);
  assert.equal((migration.match(/grant execute on function public\./g) ?? []).length, functions.length);
});

test("run identity is bound to the job and fencing token on every worker mutation", () => {
  for (const fn of [
    "start_ingestion_run_v1",
    "heartbeat_ingestion_run_v1",
    "complete_ingestion_run_v1",
    "fail_ingestion_run_v1",
  ]) {
    const start = migration.indexOf(`function public.${fn}`);
    const body = migration.slice(start, migration.indexOf("$fn$;", start));
    assert.match(body, /r\.run_id = in_run_id/);
    assert.match(body, /r\.job_id = j\.job_id/);
    assert.match(body, /r\.lease_token = in_lease_token/);
  }
});

test("completion requires source-as-of and raw evidence instead of treating liveness as freshness", () => {
  const start = migration.indexOf("function public.complete_ingestion_run_v1");
  const body = migration.slice(start, migration.indexOf("$fn$;", start));
  assert.match(body, /in_source_as_of is null/);
  assert.match(body, /in_raw_artifact_reference/);
  assert.match(body, /in_content_hash/);
  assert.match(body, /incomplete_ingestion_evidence/);
});

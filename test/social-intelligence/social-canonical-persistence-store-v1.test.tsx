import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260919193800_social_canonical_persistence_store_v1.sql"),
  "utf8",
);

test("stores canonical social snapshots as append-only private history", () => {
  assert.match(migration, /create table exec_dashboard\.social_canonical_account_snapshots_v1/);
  assert.match(migration, /canonical_key text primary key/);
  assert.match(migration, /snapshot_id text not null unique/);
  assert.match(migration, /provider_evidence_refs text\[\] not null check \(cardinality\(provider_evidence_refs\) > 0\)/);
  assert.match(migration, /evidence_refs text\[\] not null check \(cardinality\(evidence_refs\) > 0\)/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all on table exec_dashboard\.social_canonical_account_snapshots_v1 from public, anon, authenticated, service_role;/,
  );
  assert.match(migration, /grant select on table exec_dashboard\.social_canonical_account_snapshots_v1 to service_role;/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*social_canonical_account_snapshots_v1 to service_role/i);
});

test("binds durable rows to the exact zero-write canonical snapshot", () => {
  assert.match(migration, /'CanonicalSocialAccountSnapshotV1'/);
  assert.match(migration, /snapshot_json ->> 'snapshotId' = snapshot_id/);
  assert.match(migration, /snapshot_json ->> 'platform' = platform/);
  assert.match(migration, /snapshot_json ->> 'accountId' = account_id/);
  assert.match(migration, /snapshot_json ->> 'externalAccessPerformed' = 'false'/);
  assert.match(migration, /snapshot_json ->> 'writesPerformed' = 'false'/);
  assert.match(migration, /social_persistence_canonical_key_mismatch/);
  assert.match(migration, /social_persistence_canonical_evidence_mismatch/);
  assert.match(migration, /social_persistence_evidence_contains_secret/);
});

test("serializes and compare-and-sets connector checkpoints before advancing them", () => {
  assert.match(migration, /pg_advisory_xact_lock\(pg_catalog\.hashtext\(in_platform \|\| ':' \|\| in_connector_id\)\)/);
  assert.match(migration, /from exec_dashboard\.social_canonical_sync_checkpoints_v1 c[\s\S]*for update;/);
  assert.match(migration, /current_checkpoint\.cursor is distinct from in_expected_cursor/);
  assert.match(migration, /current_checkpoint\.completed_through_at is distinct from in_expected_completed_through_at/);
  assert.match(migration, /social_persistence_checkpoint_compare_and_set_failed/);
  assert.match(migration, /social_persistence_expected_checkpoint_missing/);
  assert.match(migration, /social_persistence_checkpoint_regression/);
});

test("keeps snapshot insert and checkpoint advancement in one atomic RPC", () => {
  const functionStart = migration.indexOf("create or replace function public.persist_social_canonical_snapshot_v1");
  const snapshotInsert = migration.indexOf("insert into exec_dashboard.social_canonical_account_snapshots_v1", functionStart);
  const checkpointUpdate = migration.indexOf("update exec_dashboard.social_canonical_sync_checkpoints_v1", functionStart);
  const checkpointInsert = migration.indexOf("insert into exec_dashboard.social_canonical_sync_checkpoints_v1", functionStart);

  assert.ok(functionStart >= 0);
  assert.ok(snapshotInsert > functionStart);
  assert.ok(checkpointUpdate > snapshotInsert);
  assert.ok(checkpointInsert > snapshotInsert);
  assert.match(migration, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/);
  assert.match(
    migration,
    /grant execute on function public\.persist_social_canonical_snapshot_v1\([\s\S]*\) to service_role;/,
  );
});

test("makes exact retries idempotent while refusing conflict or checkpoint-ahead repair", () => {
  assert.match(migration, /existing_snapshot\.snapshot_json is distinct from in_snapshot_json/);
  assert.match(migration, /social_persistence_snapshot_conflict/);
  assert.match(migration, /if checkpoint_at_target then[\s\S]*if not snapshot_exists then[\s\S]*social_persistence_checkpoint_ahead_of_snapshot/);
  assert.match(migration, /return query select 'IDEMPOTENT'::text/);
  assert.match(migration, /case when snapshot_exists then 'CHECKPOINT_ADVANCED'::text else 'APPLIED'::text end/);
});

test("successful durable history cannot invent a resume cursor or a different completion time", () => {
  assert.match(migration, /if in_next_cursor is not null or in_next_completed_through_at is distinct from in_retrieved_at then/);
  assert.match(migration, /social_persistence_success_checkpoint_invalid/);
  assert.match(migration, /source_state in \('CONNECTED_AND_INGESTING', 'CONNECTED_PARTIAL'\)/);
  assert.match(migration, /social_persistence_future_retrieval/);
});

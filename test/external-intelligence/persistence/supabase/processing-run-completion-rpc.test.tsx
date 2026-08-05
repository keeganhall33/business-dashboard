import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");

function asServiceRole(db: ReturnType<typeof createDisposableDb>) {
  db.psql("do $$begin create role service_role; exception when duplicate_object then null; end$$;");
  db.psql("alter role service_role login;");
  db.psql("set role service_role;");
}

test("processing run completion rpc cannot complete incomplete runs", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$; alter role service_role login;"
  );
  db.file(A61);
  asServiceRole(db);

    // Create a run that cannot complete (counts mismatch).
    db.psql(
      `insert into external_processing_runs_v1(
        run_id,input_set_fingerprint,source_registry_hash,source_sets_hash,policy_bundle_hash,engine_version,
        status,expected_output_count,persisted_output_count,persistence_complete,validation_complete,validation_result,
        output_refs_json,required_provenance_edges_json
      ) values (
        'run1','a','b','c','d','e',
        'persistence_incomplete',1,0,true,true,'ok',
        '[]'::jsonb,'[]'::jsonb
      );`
    );

  assert.throws(() => db.psql("select * from complete_external_processing_run_v1('run1');"));
});

test("processing run completion rpc happy path completes run, is idempotent, and fails closed if invariants are later violated", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$; alter role service_role login;"
  );
  db.file(A61);

  // Seed one resolvable immutable version (EvidenceReference) used as an output.
  const evHash = "a".repeat(64);
  db.psql(
    `begin;
      insert into external_evidence_references_v1(evidence_reference_id,current_content_hash,source_id,source_config_version,legal_policy_version)
      values ('ev_out','${evHash}','s1','v1','legal/v1');

      insert into external_evidence_reference_versions_v1(
        evidence_reference_id,content_hash,schema_version,source_id,source_config_version,legal_policy_version,
        policy_refs_json,supersedes_content_hashes,payload_json,retention_policy,payload_available,legal_hold
      ) values (
        'ev_out','${evHash}','v1','s1','v1','legal/v1',
        '[]'::jsonb,'[]'::jsonb,'{"ok":true}'::jsonb,'retain',true,false
      );
    commit;`
  );

  // Seed required provenance edge.
  db.psql(
    `insert into external_provenance_edges_v1(
      edge_id,
      from_object_type,from_object_id,from_content_hash,
      to_object_type,to_object_id,to_content_hash,
      relation,policy_version,policy_hash,
      from_ref_json,to_ref_json
    ) values (
      'edge_run1',
      'claim','c_run','${"b".repeat(64)}',
      'evidence_reference','ev_out','${evHash}',
      'supported_by','provenance/v1','ph_run1',
      '{}'::jsonb,'{}'::jsonb
    );`
  );

  const outRef = `[{"object_type":"evidence_reference","object_id":"ev_out","content_hash":"${evHash}"}]`;
  const reqEdges = `[{"from_object_type":"claim","from_object_id":"c_run","from_content_hash":"${
    "b".repeat(64)
  }","to_object_type":"evidence_reference","to_object_id":"ev_out","to_content_hash":"${evHash}","relation":"supported_by","policy_hash":"ph_run1"}]`;

  // Run starts as non-completed.
  db.psql(
    `insert into external_processing_runs_v1(
      run_id,input_set_fingerprint,source_registry_hash,source_sets_hash,policy_bundle_hash,engine_version,
      status,expected_output_count,persisted_output_count,persistence_complete,validation_complete,validation_result,
      output_refs_json,required_provenance_edges_json
    ) values (
      'run_ok','a','b','c','d','e',
      'persistence_incomplete',1,1,true,true,'ok',
      '${outRef}'::jsonb,'${reqEdges}'::jsonb
    );`
  );

  const before = db.psql(
    "select status||'|'||coalesce(completed_at::text,'')||'|'||persisted_output_count||'|'||output_refs_json::text from external_processing_runs_v1 where run_id='run_ok';"
  );
  assert.ok(before.startsWith("persistence_incomplete|"));

  // Complete.
  db.psqlAs("service_role", "select * from complete_external_processing_run_v1('run_ok');");

  const after = db.psql(
    "select status||'|'||coalesce(completed_at::text,'')||'|'||persisted_output_count||'|'||output_refs_json::text from external_processing_runs_v1 where run_id='run_ok';"
  );
  const [status, completedAt, persistedCount] = after.split("|", 3);
  assert.equal(status, "completed");
  assert.ok(completedAt.length > 0);
  assert.equal(persistedCount, "1");
  // JSONB text formatting/key order is not stable; compare structurally.
  const outOk = db.psql(
    `select (output_refs_json = '${outRef}'::jsonb)::text from external_processing_runs_v1 where run_id='run_ok';`
  );
  assert.equal(outOk, "true");

  const rowsBeforeReplay = db.psql(
    "select (select count(*) from external_processing_runs_v1) || ':' || (select count(*) from external_provenance_edges_v1) || ':' || (select count(*) from external_evidence_reference_versions_v1);"
  );

  // Replay completion: deterministic, no side effects (completed_at should not change).
  db.psqlAs("service_role", "select * from complete_external_processing_run_v1('run_ok');");
  const afterReplay = db.psql(
    "select status||'|'||coalesce(completed_at::text,'')||'|'||persisted_output_count||'|'||output_refs_json::text from external_processing_runs_v1 where run_id='run_ok';"
  );
  assert.equal(afterReplay, after);

  const rowsAfterReplay = db.psql(
    "select (select count(*) from external_processing_runs_v1) || ':' || (select count(*) from external_provenance_edges_v1) || ':' || (select count(*) from external_evidence_reference_versions_v1);"
  );
  assert.equal(rowsAfterReplay, rowsBeforeReplay);

  // If invariants are later violated, replay fails closed.
  // We can't mutate the completed run into an invalid state due to A5 CHECK constraints,
  // but we *can* invalidate a required provenance edge (no FK), which must be detected.
  db.psql("delete from external_provenance_edges_v1 where edge_id='edge_run1';");
  assert.throws(() => db.psqlAs("service_role", "select * from complete_external_processing_run_v1('run_ok');"));
});

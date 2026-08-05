import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");

function asServiceRole(db: ReturnType<typeof createDisposableDb>) {
  db.psql("do $$begin create role service_role; exception when duplicate_object then null; end$$;");
  db.psql("set role service_role;");
}

test("processing run completion rpc cannot complete incomplete runs", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$;"
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

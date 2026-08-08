import test from "node:test";
import assert from "node:assert/strict";

import { createDisposableDb } from "./_rpc-disposable-db";

test("a6 authz: service_role jwt claim is required (request.jwt.claim.role), not session_user", () => {
  const db = createDisposableDb();

  db.file("supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file("supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
  db.file("supabase/migrations/20260807201000_external_intelligence_phase_a6_rpc_authz_fix.sql");

  // Missing claim fails closed (even if connected as service_role DB role).
  assert.throws(() => {
    db.psqlAs(
      "service_role",
      "/*no_jwt*/ select evidence_reference_id from persist_external_evidence_reference_v1('ev1', repeat('a',64), 'evidence_reference_v1','src','v1','lp','[]'::jsonb,null,null,null,'[]'::jsonb,'{}'::jsonb,'link_only',null,false,null,null,'r',true);"
    );
  }, /unauthorized/);

  // Setting request.jwt.claim.role=service_role succeeds.
  const out2 = db.psqlAs(
    "service_role",
    "select set_config('request.jwt.claim.role','service_role', true);\nselect evidence_reference_id from persist_external_evidence_reference_v1('ev1', repeat('a',64), 'evidence_reference_v1','src','v1','lp','[]'::jsonb,null,null,null,'[]'::jsonb,'{}'::jsonb,'link_only',null,false,null,null,'r',true);"
  );
  assert.ok(String(out2).includes("ev1"));
});

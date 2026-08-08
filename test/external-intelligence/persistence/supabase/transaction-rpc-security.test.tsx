import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");

test("a6.1 rpc security: search_path set, SECURITY DEFINER, execute revoked from PUBLIC", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);

    const defs = db.psql(
      `select proname||':'||prosecdef||':'||coalesce((select setting from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace left join pg_settings s on false where p2.oid=p.oid),'')
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and proname in (
         'persist_external_evidence_reference_v1',
         'persist_external_claim_v1',
         'persist_external_signal_write_set_v1',
         'complete_external_processing_run_v1',
         'redact_external_evidence_payload_v1',
         'redact_external_claim_payload_v1',
         'redact_external_signal_payload_v1'
       ) order by proname;`
    );
    assert.ok(defs.includes("persist_external_evidence_reference_v1:true"));

    const pubExec = db.psql(
      `select has_function_privilege('public', p.oid, 'execute')
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='persist_external_evidence_reference_v1';`
    );
    assert.equal(pubExec, "f");
});

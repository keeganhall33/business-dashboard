import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(
  process.cwd(),
  "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql"
);

test("a6.1 rpc migration applies after a5 and is rerunnable", () => {
  const db = createDisposableDb();
  db.file(A5);

  // Supabase role set expected by migration grants.
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);

    // Functions exist
    const names = db.psql(
      `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%external_%' order by proname;`
    );
    assert.ok(names.includes("persist_external_evidence_reference_v1"));
    assert.ok(names.includes("persist_external_claim_v1"));
    assert.ok(names.includes("persist_external_signal_write_set_v1"));

  // Rerun
  db.file(A61);
});

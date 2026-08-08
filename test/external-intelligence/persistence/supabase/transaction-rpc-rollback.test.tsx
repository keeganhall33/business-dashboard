import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
const A61RB = path.join(
  process.cwd(),
  "supabase/rollbacks/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
);

test("a6.1 rollback removes functions but leaves tables intact", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);

  db.file(A61RB);

    const fnCount = db.psql(
      `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%persist_external_%';`
    );
    assert.equal(fnCount, "0");

    const tableCount = db.psql(
      `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'external_%_v1' and c.relkind='r';`
    );
    assert.ok(Number(tableCount) >= 11);
});

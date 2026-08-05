import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.sql");
const A61RB = path.join(
  process.cwd(),
  "supabase/migrations/20260804_external_intelligence_phase_a6_transaction_rpcs.rollback.sql"
);

test("rpc idempotency + rollback/reapply sequence", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);

    const evPayload = "'{\"ok\":true}'";
    const call = () =>
      db.psqlAs(
        "service_role",
        `select * from persist_external_evidence_reference_v1(
          'ev1','${"a".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
          null,null,null,'[]'::jsonb,${evPayload}::jsonb,
          'retain',null,false,null,null,'reason',true
        );`
      );

    const r1 = call();
    assert.ok(r1.includes("ev1"));
    const r2 = call();
    assert.ok(r2.includes("ev1"));

    // conflict: same id+hash different payload
    assert.throws(() =>
      db.psqlAs(
        "service_role",
        `select * from persist_external_evidence_reference_v1(
          'ev1','${"a".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
          null,null,null,'[]'::jsonb,'{"ok":false}'::jsonb,
          'retain',null,false,null,null,'reason',true
        );`
      )
    );

    // Apply rollback removes only RPCs
    db.file(A61RB);
    const fnExists = db.psql(
      `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='persist_external_evidence_reference_v1';`
    );
    assert.equal(fnExists, "0");

    // Tables still exist
    const tExists = db.psql(
      `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='external_evidence_references_v1' and c.relkind='r';`
    );
    assert.equal(tExists, "1");

  // Reapply
  db.file(A61);
});

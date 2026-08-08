import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "supabase/schema.sql");
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260808205200_schema_qualify_pgcrypto_digest.sql"
);
const signalMigrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260808211100_signal_schema_qualify_pgcrypto_digest.sql"
);

const QUALIFIED_SNIPPET =
  /edge_id\s*:=\s*encode\(\s*extensions\.digest\([\s\S]*?\)::text,\s*'sha256'::text\)\s*,\s*'hex'\s*\)/i;
const QUALIFIED_SIGNAL_SNIPPET =
  /edge_id\s*:=\s*encode\(\s*extensions\.digest\(\s*edge::text\s*,\s*'sha256'::text\s*\)\s*,\s*'hex'\s*\)/i;

test("persist_external_claim_v1 schema-qualifies pgcrypto digest (extensions.digest + sha256::text)", () => {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const mig = fs.readFileSync(migrationPath, "utf8");
  const sigMig = fs.readFileSync(signalMigrationPath, "utf8");

  const sliceClaimFn = (sql: string) => {
    const start = sql.search(/create\s+or\s+replace\s+function\s+persist_external_claim_v1\b/i);
    assert.ok(start >= 0, "missing persist_external_claim_v1 definition");
    const tail = sql.slice(start);

    // In migrations we usually have revoke/grant blocks immediately after the function.
    // In schema snapshots, the revoke/grant blocks may be elsewhere, so fall back to the
    // end-of-function delimiter.
    const revokeEnd = tail.search(/revoke\s+all\s+on\s+function\s+persist_external_claim_v1\b/i);
    if (revokeEnd > 0) return tail.slice(0, revokeEnd);

    const fnEnd = tail.search(/\$fn\$\s*;/i);
    assert.ok(fnEnd > 0, "missing persist_external_claim_v1 end-of-function delimiter");
    return tail.slice(0, fnEnd);
  };

  const schemaClaimFn = sliceClaimFn(schema);
  const migClaimFn = sliceClaimFn(mig);

  assert.ok(
    QUALIFIED_SNIPPET.test(schemaClaimFn),
    "schema.sql must schema-qualify digest under search_path=public"
  );
  assert.ok(
    QUALIFIED_SNIPPET.test(migClaimFn),
    "forward migration must schema-qualify digest under search_path=public"
  );

  // Guard against regressions that reintroduce unqualified digest in this RPC.
  assert.ok(
    !/edge_id\s*:=\s*encode\(\s*digest\(/i.test(schemaClaimFn),
    "schema.sql must not use unqualified digest() in persist_external_claim_v1"
  );
  assert.ok(
    !/edge_id\s*:=\s*encode\(\s*digest\(/i.test(migClaimFn),
    "migration must not use unqualified digest() in persist_external_claim_v1"
  );

  // Signal RPC: edge hashing must be schema-qualified as well.
  assert.ok(
    QUALIFIED_SIGNAL_SNIPPET.test(schema),
    "schema.sql must schema-qualify digest() inside persist_external_signal_write_set_v1"
  );
  assert.ok(
    QUALIFIED_SIGNAL_SNIPPET.test(sigMig),
    "signal forward migration must schema-qualify digest() inside persist_external_signal_write_set_v1"
  );
});

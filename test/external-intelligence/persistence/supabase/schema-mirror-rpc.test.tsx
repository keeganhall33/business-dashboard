import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "supabase/schema.sql");
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql"
);

test("schema.sql mirrors critical rpc identifiers + grants", () => {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const mig = fs.readFileSync(migrationPath, "utf8");

  for (const name of [
    "persist_external_evidence_reference_v1",
    "persist_external_claim_v1",
    "persist_external_signal_write_set_v1",
    "complete_external_processing_run_v1",
    "redact_external_evidence_payload_v1",
    "redact_external_claim_payload_v1",
    "redact_external_signal_payload_v1"
  ]) {
    assert.ok(schema.includes(name), `schema missing ${name}`);
    assert.ok(mig.includes(name), `migration missing ${name}`);
  }

  // Grants/revokes must appear in migration.
  assert.ok(/revoke\s+all\s+on\s+function\s+persist_external_evidence_reference_v1/i.test(mig));
  assert.ok(/grant\s+execute\s+on\s+function\s+persist_external_evidence_reference_v1/i.test(mig));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("migration/schema: persist_external_evidence_reference_v1 strips allowlisted volatile fields for replay equivalence", () => {
  const sql = fs.readFileSync("supabase/schema.sql", "utf8");

  // We keep this as a cheap static guard that the canonical schema mirror contains
  // the required replay-equivalence normalization.
  assert.ok(sql.includes("persist_external_evidence_reference_v1"));

  // Top-level retrieved_at removed.
  assert.ok(
    sql.includes("- 'retrieved_at'") || sql.includes("- 'retrieved_at'::text"),
    "expected schema.sql to remove retrieved_at during replay-equivalence comparison"
  );

  // Nested provenance_metadata volatile fields removed.
  assert.ok(
    sql.includes("- 'collected_at'") || sql.includes("- 'collected_at'::text"),
    "expected schema.sql to remove provenance_metadata.collected_at during replay-equivalence comparison"
  );
  assert.ok(
    sql.includes("- 'rss_position'") || sql.includes("- 'rss_position'::text"),
    "expected schema.sql to remove provenance_metadata.rss_position during replay-equivalence comparison"
  );
});


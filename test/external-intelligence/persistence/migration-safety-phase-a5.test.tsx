import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("phase a5 migration safety: no reserved unquoted window column, no destructive changes to existing tables", () => {
  const migrationPath = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  // Reserved-word audit: do not define an unquoted column named window.
  assert.equal(/\n\s*window\s+/i.test(sql), false);

  // Must be additive only.
  assert.equal(/\bdrop\s+table\b/i.test(sql), false);
  assert.equal(/\balter\s+table\s+(?!external_)/i.test(sql), false, "must not alter non-external tables");

  // Idempotent create behavior.
  assert.ok(/create\s+table\s+if\s+not\s+exists/i.test(sql));
  assert.ok(/create\s+index\s+if\s+not\s+exists/i.test(sql));
});

test("phase a5 migration safety: stable-current-version foreign keys exist and are deferrable", () => {
  const migrationPath = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(/constraint\s+external_evidence_references_v1__current_version_fk/i.test(sql));
  assert.ok(/deferrable\s+initially\s+deferred/i.test(sql));

  assert.ok(/constraint\s+external_claims_v1__current_version_fk/i.test(sql));
  assert.ok(/constraint\s+external_signals_v1__current_version_fk/i.test(sql));
});

test("phase a5 migration safety: retention payload consistency checks exist", () => {
  const migrationPath = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(/payload_available\s*=\s*true\s+and\s+payload_json\s+is\s+not\s+null/i.test(sql));
  assert.ok(/payload_available\s*=\s*false\s+and\s+payload_json\s+is\s+null/i.test(sql));

  assert.ok(/retention_policy\s+text\s+not\s+null\s+default\s+'retain'/i.test(sql));
  assert.ok(/check\s*\(retention_policy\s+in\s*\('retain','link_only','tombstone'\)\)/i.test(sql));
});

test("phase a5 migration safety: processing run completeness checks exist", () => {
  const migrationPath = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.ok(/external_processing_runs_v1__counts_check/i.test(sql));
  assert.ok(/persisted_output_count\s*<=\s*expected_output_count/i.test(sql));
  assert.ok(/external_processing_runs_v1__completed_requires_completeness_check/i.test(sql));
  assert.ok(/status\s*<>\s*'completed'/i.test(sql));
});

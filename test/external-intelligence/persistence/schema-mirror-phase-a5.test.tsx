import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "supabase/schema.sql");
const migrationPath = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");

const CRITICAL_SNIPPETS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "external_evidence_reference_versions_v1 payload consistency check",
    pattern: /external_evidence_reference_versions_v1__payload_consistency_check/i
  },
  {
    name: "external_claim_versions_v1 semantic uniqueness index",
    pattern: /external_claim_versions_v1__fingerprint_policy_uniq/i
  },
  {
    name: "external_signal_versions_v1 semantic uniqueness index",
    pattern: /external_signal_versions_v1__fingerprint_policy_er_uniq/i
  },
  {
    name: "stable current version FK evidence",
    pattern: /external_evidence_references_v1__current_version_fk/i
  },
  {
    name: "stable current version FK claim",
    pattern: /external_claims_v1__current_version_fk/i
  },
  {
    name: "stable current version FK signal",
    pattern: /external_signals_v1__current_version_fk/i
  },
  {
    name: "processing run completed requires completeness check",
    pattern: /external_processing_runs_v1__completed_requires_completeness_check/i
  },
  {
    name: "retention policy enum values",
    pattern: /retention_policy\s+text\s+not\s+null\s+default\s+'retain'\s+check\s*\(retention_policy\s+in\s*\('retain','link_only','tombstone'\)\)/i
  },
  {
    name: "processing run status enum values",
    pattern:
      /status\s+text\s+not\s+null\s+default\s+'started'\s+check\s*\(status\s+in\s*\('started','completed','no_output','blocked','failed','persistence_incomplete'\)\)/i
  },
  {
    name: "stable current version FK is deferrable initially deferred",
    pattern: /deferrable\s+initially\s+deferred/i
  }
];

test("phase a5 schema mirror: schema.sql contains critical external-intelligence definitions", () => {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  for (const t of [
    "external_evidence_references_v1",
    "external_evidence_reference_versions_v1",
    "external_claims_v1",
    "external_claim_versions_v1",
    "external_signals_v1",
    "external_signal_versions_v1",
    "external_provenance_edges_v1",
    "external_lifecycle_transitions_v1",
    "external_corrections_v1",
    "external_source_contributions_v1",
    "external_processing_runs_v1"
  ]) {
    assert.ok(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${t}\\b`, "i").test(schemaSql), `schema.sql missing create table: ${t}`);
  }

  for (const s of CRITICAL_SNIPPETS) {
    assert.ok(s.pattern.test(schemaSql), `schema.sql missing critical snippet: ${s.name}`);
  }
});

test("phase a5 schema mirror: migration and schema share critical identifiers", () => {
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  // Drift guard: ensure schema contains every constraint/index name we rely on in tests.
  for (const s of CRITICAL_SNIPPETS) {
    assert.ok(s.pattern.test(migrationSql), `migration missing critical snippet: ${s.name}`);
    assert.ok(s.pattern.test(schemaSql), `schema missing critical snippet: ${s.name}`);
  }
});

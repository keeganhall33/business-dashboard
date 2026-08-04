import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FWD = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.sql");
const RB = path.join(process.cwd(), "supabase/migrations/20260804_external_intelligence_phase_a5.rollback.sql");

const REQUIRED_TABLES = [
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
] as const;

test("phase a5 migration guard: forward SQL defines all 11 required tables and nothing outside scope", () => {
  const sql = fs.readFileSync(FWD, "utf8");

  for (const t of REQUIRED_TABLES) {
    assert.ok(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${t}\\b`, "i").test(sql), `missing create table: ${t}`);
  }

  // Negative scope guard: do not add world model / external findings / opportunities / actions / fusion.
  const forbidden = [
    "external_findings",
    "external_hypoth",
    "world_model",
    "opportunit",
    "risk_",
    "recommend",
    "action_",
    "fusion_",
    "intelligence_findings",
    "intelligence_facts"
  ];
  for (const frag of forbidden) {
    assert.equal(new RegExp(`\\b${frag}`, "i").test(sql), false, `forbidden fragment present in forward SQL: ${frag}`);
  }
});

test("phase a5 migration guard: rollback drops all 11 tables in dependency-safe order", () => {
  const rb = fs.readFileSync(RB, "utf8");

  // Required rollback order (child -> parent)
  const expectedOrder = [
    "external_processing_runs_v1",
    "external_source_contributions_v1",
    "external_corrections_v1",
    "external_lifecycle_transitions_v1",
    "external_provenance_edges_v1",
    "external_signal_versions_v1",
    "external_signals_v1",
    "external_claim_versions_v1",
    "external_claims_v1",
    "external_evidence_reference_versions_v1",
    "external_evidence_references_v1"
  ];

  let lastIdx = -1;
  for (const t of expectedOrder) {
    const idx = rb.toLowerCase().indexOf(`drop table if exists ${t}`);
    assert.ok(idx !== -1, `missing drop table for ${t}`);
    assert.ok(idx > lastIdx, `rollback order violation at ${t}`);
    lastIdx = idx;
  }
});

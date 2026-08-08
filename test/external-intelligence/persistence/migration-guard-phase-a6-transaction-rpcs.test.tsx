import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const FWD = path.join(
  process.cwd(),
  "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql"
);
const RB = path.join(
  process.cwd(),
  "supabase/rollbacks/20260804_external_intelligence_phase_a6_transaction_rpcs.sql"
);

const REQUIRED_FUNCS = [
  "persist_external_evidence_reference_v1",
  "persist_external_claim_v1",
  "persist_external_signal_write_set_v1"
] as const;

test("phase a6.1 migration guard: forward defines required RPCs", () => {
  const sql = fs.readFileSync(FWD, "utf8");
  for (const fn of REQUIRED_FUNCS) {
    assert.ok(new RegExp(`create\\s+or\\s+replace\\s+function\\s+${fn}\\b`, "i").test(sql), `missing RPC: ${fn}`);
  }
});

test("phase a6.1 migration guard: rollback drops required RPCs", () => {
  const sql = fs.readFileSync(RB, "utf8");
  for (const fn of REQUIRED_FUNCS) {
    assert.ok(new RegExp(`drop\\s+function\\s+if\\s+exists\\s+${fn}\\b`, "i").test(sql), `missing drop for RPC: ${fn}`);
  }
});

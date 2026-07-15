import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeVerificationStatus,
  summarizeOpportunityVerification,
  mapOpportunityRowForResponse,
  type OpportunityRecord
} from "../src/lib/pipeline/verification.ts";

const baseRecord: OpportunityRecord = {
  id: "op-1",
  name: "Kraken / CPA",
  organization: "Seattle Kraken",
  opportunity_type: "institutional",
  status: "negotiating",
  value_estimate: 100000,
  prestige_score: 5,
  probability_score: 0.6,
  owner_agent: "pipeline",
  next_step: "Finalize scope",
  next_step_due_at: "2026-07-20T00:00:00Z"
};

test("normalizeVerificationStatus defaults to unverified", () => {
  assert.equal(normalizeVerificationStatus({ ...baseRecord }), "unverified");
  assert.equal(normalizeVerificationStatus({ ...baseRecord, verification_status: "verified_active" }), "verified_active");
  // Unknown status should fall back
  assert.equal(normalizeVerificationStatus({ ...baseRecord, verification_status: "bad_state" as never }), "unverified");
});

test("summarizeOpportunityVerification tallies each state", () => {
  const rows: OpportunityRecord[] = [
    { ...baseRecord, verification_status: "verified_active" },
    { ...baseRecord, id: "op-2", verification_status: "verified_on_hold" },
    { ...baseRecord, id: "op-3", verification_status: "invalid" },
    { ...baseRecord, id: "op-4" }
  ];
  const summary = summarizeOpportunityVerification(rows);
  assert.equal(summary.total, 4);
  assert.equal(summary.verifiedActive, 1);
  assert.equal(summary.onHold, 1);
  assert.equal(summary.invalid, 1);
  assert.equal(summary.unverified, 1);
});

test("mapOpportunityRowForResponse carries verification metadata", () => {
  const mapped = mapOpportunityRowForResponse(
    {
      ...baseRecord,
      verification_status: "verified_active",
      verification_source: "manual",
      verification_notes: "Confirmed by Keegan",
      last_verified_at: "2026-07-15T15:00:00Z",
      last_verified_by: "system",
      value_basis: "contract",
      confidence: 0.9
    },
    null
  );
  assert.equal(mapped.verificationStatus, "verified_active");
  assert.equal(mapped.verificationSource, "manual");
  assert.equal(mapped.lastVerifiedBy, "system");
  assert.equal(mapped.valueBasis, "contract");
  assert.equal(mapped.confidence, 0.9);
});

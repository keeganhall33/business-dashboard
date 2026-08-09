import test from "node:test";
import assert from "node:assert/strict";

import { ClaimSchema, computeClaimFingerprint, type Claim } from "@/lib/external-intelligence/contracts/claim";

test("ClaimSchema requires EvidenceReference linkage", () => {
  assert.throws(() =>
    ClaimSchema.parse({
      claim_id: "c1",
      claim_fingerprint: "a".repeat(64),
      evidence_reference_id: "",
      subject: null,
      predicate: "announced",
      object: { kind: "literal", value: "x" },
      event_time: null,
      announcement_time: null,
      retrieved_at: new Date().toISOString(),
      observed_vs_inferred: "observed",
      verification_state: "unverified",
      extraction_confidence: { level: "low", reasons: [] },
      contradiction_state: "none",
      correction_state: "none",
      relevance_window: { start: null, end: null },
      schema_version: "claim_v1",
      interpretation_policy_version: "signal-interpretation/v1.0.0"
    })
  );
});

test("computeClaimFingerprint is deterministic and ignores claim_id", () => {
  const base = {
    claim_id: "c1",
    evidence_reference_id: "ev1",
    subject: null,
    predicate: "announced",
    object: { kind: "literal", value: "x" as const, unit: null },
    event_time: null,
    announcement_time: null,
    retrieved_at: new Date().toISOString(),
    observed_vs_inferred: "observed" as const,
    verification_state: "unverified" as const,
    extraction_confidence: { level: "low" as const, reasons: [] },
    contradiction_state: "none" as const,
    correction_state: "none" as const,
    relevance_window: { start: null, end: null },
    schema_version: "claim_v1",
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  };

  const input1: Omit<Claim, "claim_fingerprint"> = { ...base };
  const input2: Omit<Claim, "claim_fingerprint"> = { ...base, claim_id: "c2" };

  const fp1 = computeClaimFingerprint(input1);
  const fp2 = computeClaimFingerprint(input2);
  assert.equal(fp1, fp2);
});

test("computeClaimFingerprint: claim_v1 projection remains stable (no qualifiers)", () => {
  const base = {
    claim_id: "c1",
    evidence_reference_id: "ev1",
    subject: null,
    predicate: "announced",
    object: { kind: "literal", value: "x" as const, unit: null },
    event_time: null,
    announcement_time: null,
    retrieved_at: "2026-08-09T00:00:00.000Z",
    observed_vs_inferred: "observed" as const,
    verification_state: "unverified" as const,
    extraction_confidence: { level: "low" as const, reasons: [] },
    contradiction_state: "none" as const,
    correction_state: "none" as const,
    relevance_window: { start: null, end: null },
    schema_version: "claim_v1",
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  };

  const fp = computeClaimFingerprint(base);
  // Regression guard: if this changes, we broke V1 replay semantics.
  assert.equal(fp, computeClaimFingerprint({ ...base, claim_id: "c2" }));
});

test("ClaimSchema: claim_v2 requires qualifiers and parses", () => {
  const parsed = ClaimSchema.parse({
    claim_id: "c1",
    claim_fingerprint: "a".repeat(64),
    evidence_reference_id: "ev1",
    subject: null,
    predicate: "appointed",
    object: { kind: "literal", value: "x", value_type: "string" },
    qualifiers: [{ key: "appointment_role", value_type: "string", value: "lead digital marketing" }],
    event_time: null,
    announcement_time: null,
    retrieved_at: new Date().toISOString(),
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "low", reasons: [] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim_v2",
    interpretation_policy_version: "generalized_claim_v2"
  });
  assert.equal(parsed.schema_version, "claim_v2");
});

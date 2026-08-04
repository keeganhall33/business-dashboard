import test from "node:test";
import assert from "node:assert/strict";

import {
  evidenceReferenceIdempotencyKey,
  claimIdempotencyKey,
  signalIdempotencyKey
} from "@/lib/external-intelligence/persistence/idempotency";

const mkRef = (object_type: any, object_id: string, content_hash: string) => ({
  object_type,
  object_id,
  version_id: null,
  content_hash,
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

test("idempotency keys are deterministic", () => {
  const a = evidenceReferenceIdempotencyKey({
    evidence_reference_id: "ev1",
    content_hash: "a".repeat(64),
    source_id: "s1",
    source_config_version: "v1.0.0"
  });
  const b = evidenceReferenceIdempotencyKey({
    evidence_reference_id: "ev1",
    content_hash: "a".repeat(64),
    source_id: "s1",
    source_config_version: "v1.0.0"
  });
  assert.equal(a, b);

  const c = claimIdempotencyKey({
    claim_id: "c1",
    claim_fingerprint: "b".repeat(64),
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "a".repeat(64)) as any,
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  });
  const d = claimIdempotencyKey({
    claim_id: "c1",
    claim_fingerprint: "b".repeat(64),
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "a".repeat(64)) as any,
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  });
  assert.equal(c, d);

  const e = signalIdempotencyKey({
    signal_id: "sig1",
    signal_fingerprint: "c".repeat(64),
    claim_version_refs: [mkRef("claim", "c1", "b".repeat(64)) as any],
    interpretation_policy_version: "signal-interpretation/v1.0.0",
    entity_resolution_version: "entity-resolution/v1.0.0"
  });
  const f = signalIdempotencyKey({
    signal_id: "sig1",
    signal_fingerprint: "c".repeat(64),
    claim_version_refs: [mkRef("claim", "c1", "b".repeat(64)) as any],
    interpretation_policy_version: "signal-interpretation/v1.0.0",
    entity_resolution_version: "entity-resolution/v1.0.0"
  });
  assert.equal(e, f);
});

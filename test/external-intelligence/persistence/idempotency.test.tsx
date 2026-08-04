import test from "node:test";
import assert from "node:assert/strict";

import {
  evidenceReferenceIdempotencyKey,
  claimIdempotencyKey,
  signalIdempotencyKey,
  provenanceEdgeIdempotencyKey,
  lifecycleTransitionIdempotencyKey,
  correctionIdempotencyKey,
  sourceContributionIdempotencyKey,
  processingRunIdempotencyKey
} from "@/lib/external-intelligence/persistence/idempotency";
import type { ObjectType } from "@/lib/external-intelligence/contracts/enums";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const mkRef = (object_type: ObjectType, object_id: string, content_hash: string): VersionRef => ({
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
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "a".repeat(64)),
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  });
  const d = claimIdempotencyKey({
    claim_id: "c1",
    claim_fingerprint: "b".repeat(64),
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "a".repeat(64)),
    interpretation_policy_version: "signal-interpretation/v1.0.0"
  });
  assert.equal(c, d);

  const e = signalIdempotencyKey({
    signal_id: "sig1",
    signal_fingerprint: "c".repeat(64),
    claim_version_refs: [mkRef("claim", "c1", "b".repeat(64))],
    interpretation_policy_version: "signal-interpretation/v1.0.0",
    entity_resolution_version: "entity-resolution/v1.0.0"
  });
  const f = signalIdempotencyKey({
    signal_id: "sig1",
    signal_fingerprint: "c".repeat(64),
    claim_version_refs: [mkRef("claim", "c1", "b".repeat(64))],
    interpretation_policy_version: "signal-interpretation/v1.0.0",
    entity_resolution_version: "entity-resolution/v1.0.0"
  });
  assert.equal(e, f);

  const edgeKeyA = provenanceEdgeIdempotencyKey({
    from_ref: mkRef("claim", "c1", "1".repeat(64)),
    to_ref: mkRef("evidence_reference", "ev1", "2".repeat(64)),
    relation: "supported_by",
    policy_version: "provenance/v1.0.0"
  });
  const edgeKeyB = provenanceEdgeIdempotencyKey({
    from_ref: mkRef("claim", "c1", "1".repeat(64)),
    to_ref: mkRef("evidence_reference", "ev1", "2".repeat(64)),
    relation: "supported_by",
    policy_version: "provenance/v1.0.0"
  });
  assert.equal(edgeKeyA, edgeKeyB);

  const transitionA = lifecycleTransitionIdempotencyKey({
    object_ref: mkRef("signal", "sig1", "3".repeat(64)),
    from_status: "new",
    to_status: "active",
    effective_at: "2026-01-01T00:00:00.000Z",
    policy_version: "lifecycle/v1.0.0",
    reason_codes: ["a", "b"]
  });
  const transitionB = lifecycleTransitionIdempotencyKey({
    object_ref: mkRef("signal", "sig1", "3".repeat(64)),
    from_status: "new",
    to_status: "active",
    effective_at: "2026-01-01T00:00:00.000Z",
    policy_version: "lifecycle/v1.0.0",
    reason_codes: ["b", "a"]
  });
  assert.equal(transitionA, transitionB);

  const correctionA = correctionIdempotencyKey({
    object_ref: mkRef("claim", "c1", "4".repeat(64)),
    correction_type: "retraction",
    supersedes_ref: null,
    policy_version: "corrections/v1.0.0",
    reason: "source revoked"
  });
  const correctionB = correctionIdempotencyKey({
    object_ref: mkRef("claim", "c1", "4".repeat(64)),
    correction_type: "retraction",
    supersedes_ref: null,
    policy_version: "corrections/v1.0.0",
    reason: "source revoked"
  });
  assert.equal(correctionA, correctionB);

  const contributionA = sourceContributionIdempotencyKey({
    target_ref: mkRef("claim", "c1", "5".repeat(64)),
    source_id: "s1",
    source_set_id: null,
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "6".repeat(64))
  });
  const contributionB = sourceContributionIdempotencyKey({
    target_ref: mkRef("claim", "c1", "5".repeat(64)),
    source_id: "s1",
    source_set_id: null,
    evidence_reference_version_ref: mkRef("evidence_reference", "ev1", "6".repeat(64))
  });
  assert.equal(contributionA, contributionB);

  const runKeyA = processingRunIdempotencyKey({
    input_set_fingerprint: "7".repeat(64),
    source_registry_hash: "8".repeat(64),
    policy_bundle_hash: "9".repeat(64),
    engine_version: "engine_v1"
  });
  const runKeyB = processingRunIdempotencyKey({
    input_set_fingerprint: "7".repeat(64),
    source_registry_hash: "8".repeat(64),
    policy_bundle_hash: "9".repeat(64),
    engine_version: "engine_v1"
  });
  assert.equal(runKeyA, runKeyB);
});

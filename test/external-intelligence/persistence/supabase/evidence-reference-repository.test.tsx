/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { EvidenceReferenceRepository } from "@/lib/external-intelligence/persistence/supabase/evidence-reference.repository";
import { EXTERNAL_INTELLIGENCE_RPCS } from "@/lib/external-intelligence/persistence/supabase/transactions";
import { createEvidenceReferenceFingerprint } from "@/lib/external-intelligence/hashing/fingerprints";
import {
  PersistenceContentHashMismatchError,
  PersistenceIdempotencyConflictError
} from "@/lib/external-intelligence/persistence/errors";
import { MockSupabaseClient } from "./_mock-supabase";

function sampleEvidence() {
  return {
    evidence_reference_id: "ev1",
    source_id: "src",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://example.com",
    content_hash: null,
    retrieved_at: "2026-08-05T00:00:00.000Z",
    published_at: null,
    event_time: null,
    evidence_type: "report",
    access_classification: "public",
    legal_policy_version: "legal/v1",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    support_excerpts: [],
    source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    provenance_metadata: {},
    credibility: { level: "unknown", bounded_score: null, reasons: [] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],
    schema_version: "evidence/v1"
  } as const;
}

test("EvidenceReference: hash recomputed before RPC + correct RPC called + replay mapped + exact VersionRef returned", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistEvidence, (args) => {
    return {
      error: null,
      data: [
        {
          evidence_reference_id: String(args.in_evidence_reference_id),
          content_hash: String(args.in_content_hash),
          created_new_version: false,
          idempotent_replay: true
        }
      ]
    };
  });

  const repo = new EvidenceReferenceRepository();
  const evidence = sampleEvidence();

  const computed = createEvidenceReferenceFingerprint({
    source_id: evidence.source_id,
    source_config_version: evidence.source_config_version,
    source_set_id: evidence.source_set_id,
    source_artifact_identifier: evidence.source_artifact_identifier,
    source_url_or_reference: evidence.source_url_or_reference,
    content_hash: evidence.content_hash,
    retrieved_at: evidence.retrieved_at,
    published_at: evidence.published_at,
    event_time: evidence.event_time,
    evidence_type: evidence.evidence_type,
    access_classification: evidence.access_classification,
    legal_policy_version: evidence.legal_policy_version,
    retention_policy: evidence.retention_policy,
    excerpt_or_summary_reference: evidence.excerpt_or_summary_reference,
    source_credibility_prior: evidence.source_credibility_prior,
    correction_status: evidence.correction_status,
    retraction_status: evidence.retraction_status,
    supersedes_evidence_reference_id: evidence.supersedes_evidence_reference_id,
    schema_version: evidence.schema_version
  });

  const res = await repo.persistEvidenceReference({
    evidence: evidence as any,
    policy_refs_json: [],
    policy_version: "policy/v1",
    opts: { client: mock as any }
  });

  assert.equal(mock.rpcCalls.length, 1);
  assert.equal(mock.rpcCalls[0]!.fn, EXTERNAL_INTELLIGENCE_RPCS.persistEvidence);
  assert.equal(mock.rpcCalls[0]!.args.in_content_hash, computed);

  assert.equal(res.idempotent_replay, true);
  assert.equal(res.created_new_version, false);
  assert.equal(res.ref.object_type, "evidence_reference");
  assert.equal(res.ref.object_id, "ev1");
  assert.equal(res.ref.content_hash, computed);

  assert.ok(Object.isFrozen(res));
  assert.ok(Object.isFrozen(res.ref));
});

test("EvidenceReference: supplied hash mismatch rejected before RPC", async () => {
  const mock = new MockSupabaseClient();
  const repo = new EvidenceReferenceRepository();

  await assert.rejects(
    () =>
      repo.persistEvidenceReference({
        evidence: sampleEvidence() as any,
        policy_refs_json: [],
        policy_version: "policy/v1",
        supplied_content_hash: "a".repeat(64),
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceContentHashMismatchError
  );

  assert.equal(mock.rpcCalls.length, 0);
});

test("EvidenceReference: integrity conflict mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistEvidence, () => ({ error: { message: "integrity_conflict" }, data: null }));

  const repo = new EvidenceReferenceRepository();
  await assert.rejects(
    () =>
      repo.persistEvidenceReference({
        evidence: sampleEvidence() as any,
        policy_refs_json: [],
        policy_version: "policy/v1",
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceIdempotencyConflictError
  );
});

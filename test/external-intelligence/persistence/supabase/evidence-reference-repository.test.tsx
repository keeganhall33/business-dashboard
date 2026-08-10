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
import { normalizeEvidencePayloadForReplayEquivalenceV1 } from "@/lib/external-intelligence/persistence/evidence-replay-equivalence-v1";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";

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

test("EvidenceReference: historical Contract-Y replay is recognized without new version write", async () => {
  const mock = new MockSupabaseClient();

  const incoming = sampleEvidence() as any;

  // Simulate a historical Contract-Y persisted version where outer==inner.
  // Stored version hash equals payload_json.content_hash.
  const historicalInner = computeContentHash({ v: "targeted_web_preview_v1", retainedSemantic: { url: "https://example.com" } });
  const historicalPayload = {
    ...incoming,
    // Inner retained payload hash.
    content_hash: historicalInner,
    // Volatile drift allowed.
    retrieved_at: "2026-08-01T00:00:00.000Z",
    provenance_metadata: { collected_at: "2026-08-01T00:00:00.000Z", rss_position: 3 }
  };

  // Ensure replay equivalence holds after normalization.
  const dropContentHash = (p: any) => {
    const base = normalizeEvidencePayloadForReplayEquivalenceV1(p) as any;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { content_hash, ...rest } = base;
    return rest;
  };
  const normIncoming = computeContentHash(dropContentHash(incoming));
  const normExisting = computeContentHash(dropContentHash(historicalPayload));
  assert.equal(normIncoming, normExisting);

  mock.seedTable("external_evidence_reference_versions_v1", [
    {
      evidence_reference_id: "ev1",
      content_hash: historicalInner,
      created_at: "2026-08-01T00:00:00.000Z",
      payload_available: true,
      payload_json: historicalPayload,
      schema_version: incoming.schema_version,
      source_id: incoming.source_id,
      source_config_version: incoming.source_config_version,
      legal_policy_version: incoming.legal_policy_version,
      retention_policy: incoming.retention_policy
    }
  ]);

  // If the idempotency guard works, we should not hit the RPC at all.
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistEvidence, () => ({
    error: null,
    data: [
      {
        evidence_reference_id: "ev1",
        content_hash: "should_not_be_called",
        created_new_version: true,
        idempotent_replay: false
      }
    ]
  }));

  const repo = new EvidenceReferenceRepository();
  const res = await repo.persistEvidenceReference({
    evidence: incoming,
    policy_refs_json: [],
    policy_version: "policy/v1",
    opts: { client: mock as any }
  });

  assert.equal(mock.rpcCalls.length, 0);
  assert.equal(res.created_new_version, false);
  assert.equal(res.idempotent_replay, true);
  assert.equal(res.ref.object_id, "ev1");
  assert.equal(res.ref.content_hash, historicalInner);
});

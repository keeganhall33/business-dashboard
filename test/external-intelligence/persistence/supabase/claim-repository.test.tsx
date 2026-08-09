/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { ClaimRepository } from "@/lib/external-intelligence/persistence/supabase/claim.repository";
import { EXTERNAL_INTELLIGENCE_RPCS } from "@/lib/external-intelligence/persistence/supabase/transactions";
import {
  PersistenceIdempotencyConflictError,
  PersistenceClaimVersionIdentityConflictError,
  PersistenceLinkedVersionNotFoundError,
  PersistenceObjectTypeMismatchError
} from "@/lib/external-intelligence/persistence/errors";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import { MockSupabaseClient } from "./_mock-supabase";

function hex(ch: string) {
  return ch.repeat(64);
}

function evidenceRef() {
  return {
    object_type: "evidence_reference",
    object_id: "ev1",
    version_id: null,
    content_hash: hex("b"),
    schema_version: "evidence/v1",
    policy_version: "policy/v1",
    created_at: "2026-08-05T00:00:00.000Z"
  } as const;
}

function sampleClaim() {
  const base = {
    claim_id: "c1",
    evidence_reference_id: "ev1",
    subject: {
      entity_id: "ent1",
      entity_type: "company",
      canonical_name: "Acme",
      aliases: [],
      source_specific_ids: {},
      resolution_status: "resolved",
      resolution_confidence: {
        level: "known",
        bounded_score: 1,
        reasons: [],
        blockers: [],
        supporting_reference_ids: [],
        contradicting_reference_ids: [],
        missing_evidence_ids: []
      },
      ambiguity_flags: [],
      possible_entity_ids: [],
      alias_provenance: [],
      entity_resolution_version: "er/v1",
      last_verified_at: null,
      valid_from: null,
      valid_until: null
    },
    predicate: "announced",
    object: { kind: "literal", value: "x", value_type: "string" },
    event_time: null,
    announcement_time: null,
    retrieved_at: "2026-08-05T00:00:00.000Z",
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: [] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim/v1",
    interpretation_policy_version: "ip/v1"
  } as any;

  const fp = computeClaimFingerprint({
    ...base,
    claim_id: base.claim_id,
    claim_fingerprint: undefined
  } as any);

  return { ...base, claim_fingerprint: fp };
}

test("Claim: exact EvidenceReference VersionRef required; wrong type rejected before RPC", async () => {
  const mock = new MockSupabaseClient();
  const repo = new ClaimRepository();

  await assert.rejects(
    () =>
      repo.persistClaim({
        claim: sampleClaim() as any,
        evidence_version_ref: { ...evidenceRef(), object_type: "claim" } as any,
        policy_refs_json: [],
        interpretation_policy_hash: hex("c"),
        edge: { relation: "supports", policy_version: "prov/v1", policy_hash: hex("d") },
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceObjectTypeMismatchError
  );

  assert.equal(mock.rpcCalls.length, 0);
});

test("Claim: fingerprint and hash recomputed; linked-version error mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistClaim, (args) => {
    assert.equal(args.in_content_hash, computeContentHash(sampleClaim()));
    return { error: { message: "linked_version_not_found" }, data: null };
  });

  const repo = new ClaimRepository();
  await assert.rejects(
    () =>
      repo.persistClaim({
        claim: sampleClaim() as any,
        evidence_version_ref: evidenceRef() as any,
        policy_refs_json: [],
        interpretation_policy_hash: hex("c"),
        edge: { relation: "supports", policy_version: "prov/v1", policy_hash: hex("d") },
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceLinkedVersionNotFoundError
  );
});

test("Claim: integrity error mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistClaim, () => ({ error: { message: "integrity_conflict" }, data: null }));

  const repo = new ClaimRepository();
  await assert.rejects(
    () =>
      repo.persistClaim({
        claim: sampleClaim() as any,
        evidence_version_ref: evidenceRef() as any,
        policy_refs_json: [],
        interpretation_policy_hash: hex("c"),
        edge: { relation: "supports", policy_version: "prov/v1", policy_hash: hex("d") },
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceIdempotencyConflictError
  );
});

test("Claim: claim_version_identity_conflict mapped", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistClaim, () => ({ error: { message: "claim_version_identity_conflict" }, data: null }));

  const repo = new ClaimRepository();
  await assert.rejects(
    () =>
      repo.persistClaim({
        claim: sampleClaim() as any,
        evidence_version_ref: evidenceRef() as any,
        policy_refs_json: [],
        interpretation_policy_hash: hex("c"),
        edge: { relation: "supports", policy_version: "prov/v1", policy_hash: hex("d") },
        opts: { client: mock as any }
      }),
    (err: any) => err instanceof PersistenceClaimVersionIdentityConflictError
  );
});

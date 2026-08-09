/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { ExternalSignalRepository } from "@/lib/external-intelligence/persistence/supabase/external-signal.repository";
import { EXTERNAL_INTELLIGENCE_RPCS } from "@/lib/external-intelligence/persistence/supabase/transactions";
import { createExternalSignalFingerprint } from "@/lib/external-intelligence/hashing/fingerprints";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import { MockSupabaseClient } from "./_mock-supabase";

function hex(ch: string) {
  return ch.repeat(64);
}

function claimRef() {
  return {
    object_type: "claim",
    object_id: "c1",
    version_id: null,
    content_hash: hex("a"),
    schema_version: "claim_v1",
    policy_version: "ip/v1",
    created_at: "2026-08-05T00:00:00.000Z"
  } as const;
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

function entityRef() {
  return {
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
  } as const;
}

function axisKnown() {
  return {
    level: "known",
    bounded_score: 1,
    reasons: [],
    blockers: [],
    supporting_reference_ids: [],
    contradicting_reference_ids: [],
    missing_evidence_ids: []
  } as const;
}

function sampleSignal() {
  const coreClaim = claimRef();
  const fp = createExternalSignalFingerprint({
    entity_ids: [entityRef().entity_id],
    signal_type: "verified_event",
    core_claim_fingerprint: coreClaim.content_hash,
    event_window: { start: "2026-08-05T00:00:00.000Z", end: "2026-08-05T00:00:00.000Z" },
    business_domains: ["sports"],
    geography: null,
    mechanism: null
  });

  return {
    signal_id: "s1",
    signal_schema_version: "signal/v1",
    interpretation_policy_version: "ip/v1",
    confidence_policy_version: "cp/v1",
    disposition_policy_version: "dp/v1",
    legal_policy_version: "legal/v1",
    entity_resolution_version: "er/v1",
    source_registry_version: "sr/v1",
    signal_fingerprint: fp,

    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    first_observed_at: "2026-08-05T00:00:00.000Z",
    last_observed_at: "2026-08-05T00:00:00.000Z",

    lifecycle_status: "candidate",
    supersedes_signal_ids: [],
    superseded_by_signal_id: null,

    signal_type: "verified_event",
    signal_classification: "official",

    business_domains: ["sports"],
    affected_entities: [entityRef()],
    affected_markets: [],
    geography: null,
    languages: ["en"],

    source_ids: ["src"],
    source_set_ids: [],

    evidence_reference_version_refs: [evidenceRef()],
    claim_version_refs: [coreClaim],

    event_version_refs: [],
    relationship_version_refs: [],
    trend_version_refs: [],

    normalized_statement: "x",
    observed_fact: "x",
    inferred_interpretation: null,

    expected_business_mechanism: null,
    internal_business_relevance: null,
    strategic_fit: null,
    opportunity_relevance: null,
    risk_relevance: null,

    novelty: "new",
    urgency: "low",
    expiration: "2026-08-06T00:00:00.000Z",
    review_by: null,

    supporting_evidence: [],
    contradicting_evidence: [],
    missing_evidence: [],

    corroboration_count: 0,
    independent_source_count: 0,

    source_credibility_summary: "",
    signal_credibility: { level: "high", reasons: [] },
    confidence: {
      evidence: axisKnown(),
      interpretation: axisKnown(),
      business_relevance: axisKnown(),
      mechanism: axisKnown(),
      timing: axisKnown(),
      entity_resolution: axisKnown(),
      overall: axisKnown()
    },
    uncertainty_reasons: [],

    what_would_strengthen: [],
    what_would_weaken: [],
    what_would_invalidate: [],

    disposition: "monitor",
    disposition_reason_codes: [],

    escalation_eligibility: "eligible",
    fusion_eligibility: "blocked",

    monitoring_cadence: null,
    relevance_expires_at: "2026-08-06T00:00:00.000Z",
    archived_at: null,

    extraction_method: "deterministic",
    deterministic_rules_applied: [],
    llm_assistance_used: false,
    model_version: null,
    prompt_version: null,
    human_review_status: null,
    correction_history: [],

    access_classification: "public"
  } as const;
}

function validEdge() {
  const from = claimRef();
  const to = evidenceRef();
  return {
    edge_id: "e1",
    from_object_type: from.object_type,
    from_object_id: from.object_id,
    from_content_hash: from.content_hash,
    from_ref_json: from,
    to_object_type: to.object_type,
    to_object_id: to.object_id,
    to_content_hash: to.content_hash,
    to_ref_json: to,
    relation: "supports",
    policy_version: "prov/v1",
    policy_hash: hex("c"),
    created_at: "2026-08-05T00:00:00.000Z"
  };
}

function validContribution() {
  const target = evidenceRef();
  return {
    contribution_id: "c1",
    target_object_type: target.object_type,
    target_object_id: target.object_id,
    target_content_hash: target.content_hash,
    target_ref_json: target,
    source_id: "src",
    source_config_version: "v1",
    capture_method: "crawl",
    contributor_type: "system",
    contributor_id: "svc",
    created_at: "2026-08-05T00:00:00.000Z"
  };
}

test("ExternalSignal: provenance and contribution payloads validated (mismatch rejected before RPC)", async () => {
  const mock = new MockSupabaseClient();
  const repo = new ExternalSignalRepository();

  const bad = { ...validEdge(), from_object_id: "DIFF" };

  await assert.rejects(
    () =>
      repo.persistSignalWriteSet({
        signal: sampleSignal() as any,
        policy_refs: [],
        required_provenance_edges_json: [bad],
        required_source_contributions_json: [validContribution()],
        interpretation_policy_hash: hex("d"),
        opts: { client: mock as any }
      }),
    /version_ref_mismatch/
  );

  assert.equal(mock.rpcCalls.length, 0);
});

test("ExternalSignal: one RPC call is the complete write set; replay mapped; no run completion attempted", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistSignalWriteSet, (args) => {
    assert.equal(args.in_content_hash, computeContentHash(sampleSignal()));
    return {
      error: null,
      data: [
        {
          signal_id: "s1",
          content_hash: String(args.in_content_hash),
          created_new_version: true,
          idempotent_replay: false,
          persisted_provenance_count: 1,
          persisted_contribution_count: 1,
          resulting_run_status: null
        }
      ]
    };
  });

  const repo = new ExternalSignalRepository();
  const res = await repo.persistSignalWriteSet({
    signal: sampleSignal() as any,
    policy_refs: [],
    required_provenance_edges_json: [validEdge()],
    required_source_contributions_json: [validContribution()],
    interpretation_policy_hash: hex("d"),
    opts: { client: mock as any }
  });

  assert.equal(mock.rpcCalls.length, 1);
  assert.equal(mock.rpcCalls[0]!.fn, EXTERNAL_INTELLIGENCE_RPCS.persistSignalWriteSet);
  assert.notEqual(mock.rpcCalls[0]!.fn, EXTERNAL_INTELLIGENCE_RPCS.completeRun);

  assert.equal(res.ref.object_type, "signal");
  assert.equal(res.created_new_version, true);
  assert.equal(res.persisted_provenance_count, 1);
  assert.equal(res.persisted_contribution_count, 1);
  assert.ok(Object.isFrozen(res));
  assert.ok(Object.isFrozen(res.ref));
});

test("ExternalSignal: RPC failure produces no partial-success result", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.persistSignalWriteSet, () => ({ error: { message: "integrity_conflict" }, data: null }));

  const repo = new ExternalSignalRepository();
  await assert.rejects(() =>
    repo.persistSignalWriteSet({
      signal: sampleSignal() as any,
      policy_refs: [],
      required_provenance_edges_json: [validEdge()],
      required_source_contributions_json: [validContribution()],
      interpretation_policy_hash: hex("d"),
      opts: { client: mock as any }
    })
  );
});

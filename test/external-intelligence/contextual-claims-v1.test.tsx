import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { ClaimSchema, computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import { canonicalizeClaimQualifiersV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { buildDeterministicClaimIdV2, buildDeterministicClaimIdV2Object } from "@/lib/external-intelligence/contracts/claim-id-v2";
import {
  buildClassifiedAsClaimV1,
  buildProvidesServiceToClaimV1
} from "@/lib/external-intelligence/contextual-claims/contextual-claims-builders-v1";
import { getAgencyScopeAnswerFromExistingClaimsV1 } from "@/lib/external-intelligence/opportunities/agency-scope-partial-answer-v1";

function loadProductionClaimFixture(file: string) {
  const raw = JSON.parse(readFileSync(new URL(`../fixtures/external-intelligence/production-claims/${file}`, import.meta.url), "utf8")) as {
    claim_id: string;
    content_hash: string;
    schema_version: string;
    payload_json: unknown;
  };
  const payload = ClaimSchema.parse(raw.payload_json) as Claim;
  return { raw, payload };
}

test("BACKWARD COMPATIBILITY SNAPSHOT: production claim fixtures remain unchanged", () => {
  const c1 = loadProductionClaimFixture("claim-1.json");
  const c2 = loadProductionClaimFixture("claim-2.json");
  const c3 = loadProductionClaimFixture("claim-3.json");

  // These are the authoritative immutable fixtures.
  assert.equal(c1.raw.claim_id, "cl_aeff8c0fc82472845b1e758d");
  assert.equal(c1.raw.content_hash, "2fd5297932868c9d606453778f7913c6c88110c0e4f75815acff3ff45003c7c2");
  assert.equal(c1.raw.schema_version, "claim_v1");

  assert.equal(c2.raw.claim_id, "cl_e3c89b410a043db766bcf711");
  assert.equal(c2.raw.content_hash, "b4b6f1ba828fc09f9920ac44486dcd21ebd6e3d1f28e8a87ad1aac51b81373e9");
  assert.equal(c2.raw.schema_version, "claim_v2");

  assert.equal(c3.raw.claim_id, "cl_506650e255d94915d1bb4b81");
  assert.equal(c3.raw.content_hash, "5b6ad1e025adbe5651eb737918e0d595c66817fe0157c5e1125fe245aa47b92c");
  assert.equal(c3.raw.schema_version, "claim_v2");

  // Fingerprints are recomputed deterministically from payload and must match.
  for (const c of [c1, c2, c3]) {
    const { claim_fingerprint: _ignored, ...rest } = c.payload;
    void _ignored;
    const computed = computeClaimFingerprint(rest);
    assert.equal(computed, c.payload.claim_fingerprint);
  }
});

test("LITERAL OBJECT CLAIM IDENTITY: NOT SUPPORTED by buildDeterministicClaimIdV2 (entity-only), supported by buildDeterministicClaimIdV2Object", () => {
  // buildDeterministicClaimIdV2 requires entity object at type level.
  // buildDeterministicClaimIdV2Object supports literal identity with explicit type discrimination.

  const subject = {
    entity_id: "provisional:organization:subj",
    entity_type: "organization",
    canonical_name: "Subject",
    aliases: [],
    alias_provenance: [],
    source_specific_ids: {},
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    resolution_status: "unresolved",
    possible_entity_ids: [],
    ambiguity_flags: [],
    resolution_confidence: { level: "possible", bounded_score: null, reasons: ["fixture"], blockers: [], missing_evidence_ids: [], supporting_reference_ids: [], contradicting_reference_ids: [] },
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  } as const;

  const base = {
    evidence_reference_id: "ev_lit",
    predicate: "classified_as",
    subject,
    qualifiers: canonicalizeClaimQualifiersV2([{ key: "classification_kind", value_type: "string", value: "business_domain" }]),
    identity_keys: ["classification_kind"]
  };

  const a = buildDeterministicClaimIdV2Object({
    ...base,
    object: { kind: "literal", value_type: "string", value: "sports", unit: null, language: null }
  });

  const b = buildDeterministicClaimIdV2Object({
    ...base,
    object: { kind: "literal", value_type: "string", value: "media", unit: null, language: null }
  });

  const c = buildDeterministicClaimIdV2Object({
    ...base,
    object: { kind: "literal", value_type: "number", value: 1, unit: null, language: null }
  });

  const d = buildDeterministicClaimIdV2Object({
    ...base,
    object: { kind: "literal", value_type: "string", value: "1", unit: null, language: null }
  });

  assert.notEqual(a, b);
  assert.notEqual(c, d);
});

test("classified_as: bounded values + identity rules", () => {
  const org = {
    entity_id: "provisional:organization:pp",
    entity_type: "organization",
    canonical_name: "Premier Padel",
    aliases: [],
    alias_provenance: [],
    source_specific_ids: {},
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    resolution_status: "unresolved",
    possible_entity_ids: [],
    ambiguity_flags: [],
    resolution_confidence: { level: "possible", bounded_score: null, reasons: ["fixture"], blockers: [], missing_evidence_ids: [], supporting_reference_ids: [], contradicting_reference_ids: [] },
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  } as const;

  const evidence_version_ref = {
    object_type: "evidence_reference",
    object_id: "ev_fixture",
    version_id: null,
    content_hash: "f".repeat(64),
    schema_version: "evidence_reference_v1",
    policy_version: "legal_policy",
    created_at: new Date().toISOString()
  } as const;

  const c1 = buildClassifiedAsClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    subject: org,
    classification_kind: "organization_type",
    classification_value: "league_or_tour",
    source_label: "the world's leading professional padel tour",
    normalization_policy_version: "np.v1",
    normalization_confidence: "high"
  });

  const c2 = buildClassifiedAsClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    subject: org,
    classification_kind: "business_domain",
    classification_value: "sports"
  });

  assert.equal(c1.predicate, "classified_as");
  assert.equal(c1.object.kind, "literal");
  assert.equal(c2.object.kind, "literal");

  // Different kind/value => different ids.
  assert.notEqual(c1.claim_id, c2.claim_id);

  // source_label drift must not change identity.
  const c1b = buildClassifiedAsClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    subject: org,
    classification_kind: "organization_type",
    classification_value: "league_or_tour",
    source_label: "a different label"
  });
  assert.equal(c1.claim_id, c1b.claim_id);
});

test("provides_service_to: atomic claims per service_scope + identity rules", () => {
  const provider = {
    entity_id: "provisional:organization:tt",
    entity_type: "organization",
    canonical_name: "Ten Toes",
    aliases: [],
    alias_provenance: [],
    source_specific_ids: {},
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    resolution_status: "unresolved",
    possible_entity_ids: [],
    ambiguity_flags: [],
    resolution_confidence: { level: "possible", bounded_score: null, reasons: ["fixture"], blockers: [], missing_evidence_ids: [], supporting_reference_ids: [], contradicting_reference_ids: [] },
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  } as const;

  const client = {
    entity_id: "provisional:organization:pp",
    entity_type: "organization",
    canonical_name: "Premier Padel",
    aliases: [],
    alias_provenance: [],
    source_specific_ids: {},
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    resolution_status: "unresolved",
    possible_entity_ids: [],
    ambiguity_flags: [],
    resolution_confidence: { level: "possible", bounded_score: null, reasons: ["fixture"], blockers: [], missing_evidence_ids: [], supporting_reference_ids: [], contradicting_reference_ids: [] },
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  } as const;

  const evidence_version_ref = {
    object_type: "evidence_reference",
    object_id: "ev_fixture2",
    version_id: null,
    content_hash: "a".repeat(64),
    schema_version: "evidence_reference_v1",
    policy_version: "legal_policy",
    created_at: new Date().toISOString()
  } as const;

  const d = buildProvidesServiceToClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    provider,
    client,
    service_scope: "digital_marketing",
    service_scope_label: "lead digital marketing"
  });

  const c = buildProvidesServiceToClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    provider,
    client,
    service_scope: "content"
  });

  assert.notEqual(d.claim_id, c.claim_id);

  // label drift doesn't change identity.
  const d2 = buildProvidesServiceToClaimV1({
    evidence_version_ref,
    retrieved_at_iso: new Date().toISOString(),
    provider,
    client,
    service_scope: "digital_marketing",
    service_scope_label: "different label"
  });
  assert.equal(d.claim_id, d2.claim_id);
});

test("appointed partial-answer adapter: recognizes appointment_role and does not synthesize service claims", () => {
  const fixture = loadProductionClaimFixture("claim-2.json");

  const stable = {
    claim_id: fixture.raw.claim_id,
    current_content_hash: fixture.raw.content_hash,
    schema_version: fixture.raw.schema_version,
    interpretation_policy_version: (fixture.payload as Claim).interpretation_policy_version
  };

  const out = getAgencyScopeAnswerFromExistingClaimsV1({
    claims: [{ stable, payload: fixture.payload }],
    context_entity_id: "provisional:organization:855052d8c715418165b6cb72",
    focal_entity_id: "provisional:organization:9b2d3f13e916cbe833187a41"
  });

  assert.equal(out.status, "PARTIALLY_ANSWERED");
  assert.equal((out as { status: "PARTIALLY_ANSWERED"; appointment_role: string }).appointment_role, "lead digital marketing");
});

test("entity-object claim id helper remains unchanged for existing v2 entity-object claims", () => {
  const fixture = loadProductionClaimFixture("claim-2.json");
  assert.equal(fixture.payload.schema_version, "claim_v2");
  assert.equal(fixture.payload.object.kind, "entity");
  assert.ok(fixture.payload.subject);

  const q = canonicalizeClaimQualifiersV2((fixture.payload as Claim).qualifiers ?? []);

  // Recompute using the original entity-only helper.
  const recomputed = buildDeterministicClaimIdV2({
    evidence_reference_id: fixture.payload.evidence_reference_id,
    predicate: fixture.payload.predicate,
    subject: fixture.payload.subject!,
    object: fixture.payload.object.entity,
    qualifiers: q,
    identity_keys: ["appointment_role"]
  });

  assert.equal(recomputed, fixture.payload.claim_id);
});

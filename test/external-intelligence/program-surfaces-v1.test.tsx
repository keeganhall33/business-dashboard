import test from "node:test";
import assert from "node:assert/strict";

import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { ClaimSchema } from "@/lib/external-intelligence/contracts/claim";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import { computeClaimFingerprint } from "@/lib/external-intelligence/contracts/claim";
import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { buildProgramSurfaceClaimV1 } from "@/lib/external-intelligence/program-surfaces/program-surface-builders-v1";

const ORG = {
  entity_id: "provisional:organization:o1",
  entity_type: "organization",
  canonical_name: "Org",
  aliases: [],
  alias_provenance: [],
  source_specific_ids: {},
  entity_resolution_version: "entity_resolution_v1.provisional_only",
  resolution_status: "unresolved",
  possible_entity_ids: [],
  ambiguity_flags: [],
  resolution_confidence: {
    level: "possible",
    bounded_score: null,
    reasons: ["fixture"],
    blockers: [],
    missing_evidence_ids: [],
    supporting_reference_ids: [],
    contradicting_reference_ids: []
  },
  last_verified_at: null,
  valid_from: null,
  valid_until: null
} as const;

const EVIDENCE = {
  object_type: "evidence_reference",
  object_id: "ev_fixture",
  version_id: null,
  content_hash: "f".repeat(64),
  schema_version: "evidence_reference_v1",
  policy_version: "legal_policy",
  created_at: new Date().toISOString()
} as const;

function assertClaimPayloadValid(claim: Claim) {
  const parsed = ClaimSchema.parse(claim) as Claim;
  const { claim_fingerprint: _ignored, ...rest } = parsed;
  void _ignored;
  assert.equal(computeClaimFingerprint(rest), parsed.claim_fingerprint);
}

test("positive fixtures: builds one HIGH-confidence eligible claim per predicate", () => {
  const now = new Date().toISOString();

  const cases = [
    ["operates_event_program", "tour", []],
    ["runs_partner_activations", "campaign_integration", []],
    ["offers_vip_hospitality", "vip_packages", []],
    ["runs_relationship_recognition", "client_gifting", []],
    ["operates_physical_environment", "hotel", [{ key: "operation_relation", value_type: "string", value: "owned" }]],
    ["runs_philanthropy_program", "foundation", []],
    ["operates_merchandising", "official_shop", []],
    ["operates_licensing", "brand_ip_licensing", []],
    ["operates_retail_distribution", "wholesale", []],
    ["runs_art_culture_design_program", "art_commissions", []],
    [
      "runs_commemoration_program",
      "induction_program",
      [{ key: "recurrence", value_type: "string", value: "annual" }]
    ]
  ] as const;

  for (const [predicate, object_value, qualifiers] of cases) {
    const out = buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate,
      object_value,
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_WEBSITE",
      qualifiers
    });

    assert.equal(out.status, "eligible");
    assert.equal(out.persistence_eligible, true);
    assert.equal(out.claim.schema_version, "claim_v2");
    assertClaimPayloadValid(out.claim);

    const content_hash = computeContentHash(out.claim);
    assert.match(content_hash, /^[a-f0-9]{64}$/);
  }
});

test("confidence gating: MEDIUM => preview (no persistence), LOW => fail-closed", () => {
  const now = new Date().toISOString();

  const preview = buildProgramSurfaceClaimV1({
    evidence_version_ref: EVIDENCE,
    retrieved_at_iso: now,
    subject: ORG,
    predicate: "operates_event_program",
    object_value: "event_series",
    normalization_confidence: "medium",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_EVENT_PAGE",
    qualifiers: [{ key: "recurrence", value_type: "string", value: "annual" }]
  });
  assert.equal(preview.status, "preview");
  assert.equal(preview.persistence_eligible, false);

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_event_program",
      object_value: "event_series",
      normalization_confidence: "low",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_EVENT_PAGE",
      qualifiers: []
    })
  );
});

test("unknown object is prohibited", () => {
  const now = new Date().toISOString();
  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_licensing",
      // @ts-expect-error intentional invalid
      object_value: "unknown",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_WEBSITE",
      qualifiers: []
    })
  );
});

test("qualifier validation: duplicate keys, >8 qualifiers, null values, unsupported keys", () => {
  const now = new Date().toISOString();

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_event_program",
      object_value: "tour",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_EVENT_PAGE",
      qualifiers: [
        { key: "recurrence", value_type: "string", value: "annual" },
        { key: "recurrence", value_type: "string", value: "periodic" }
      ]
    })
  );

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_event_program",
      object_value: "tour",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_EVENT_PAGE",
      qualifiers: Array.from({ length: 9 }).map(
        (_, i) => ({ key: `k${i}`, value_type: "string", value: "x" })
      ) as unknown as ClaimQualifierV2[]
    })
  );

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_event_program",
      object_value: "tour",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_EVENT_PAGE",
      qualifiers: [{ key: "recurrence", value_type: "null", value: null }] as unknown as ClaimQualifierV2[]
    })
  );

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_event_program",
      object_value: "tour",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_EVENT_PAGE",
      qualifiers: [{ key: "program_name", value_type: "string", value: "My Tour" }]
    })
  );
});

test("event-boundary guards encoded as taxonomy: recurrence=one_time is rejected; hosts_in is rejected", () => {
  const now = new Date().toISOString();

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "runs_commemoration_program",
      object_value: "awards_program",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_WEBSITE",
      qualifiers: [{ key: "recurrence", value_type: "string", value: "one_time" }] as unknown as ClaimQualifierV2[]
    })
  );

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "operates_physical_environment",
      object_value: "sports_venue",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_WEBSITE",
      qualifiers: [{ key: "operation_relation", value_type: "string", value: "hosts_in" }] as unknown as ClaimQualifierV2[]
    })
  );
});

test("commemoration recurrence required; recurrence is NON-IDENTITY: claim_id stable, fingerprint changes", () => {
  const now = new Date().toISOString();

  assert.throws(() =>
    buildProgramSurfaceClaimV1({
      evidence_version_ref: EVIDENCE,
      retrieved_at_iso: now,
      subject: ORG,
      predicate: "runs_commemoration_program",
      object_value: "induction_program",
      normalization_confidence: "high",
      evidence_domain: "EXTERNAL",
      external_source_class: "OFFICIAL_WEBSITE",
      qualifiers: []
    })
  );

  const a = buildProgramSurfaceClaimV1({
    evidence_version_ref: EVIDENCE,
    retrieved_at_iso: now,
    subject: ORG,
    predicate: "runs_commemoration_program",
    object_value: "induction_program",
    normalization_confidence: "high",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_WEBSITE",
    qualifiers: [{ key: "recurrence", value_type: "string", value: "annual" }]
  });

  const b = buildProgramSurfaceClaimV1({
    evidence_version_ref: EVIDENCE,
    retrieved_at_iso: now,
    subject: ORG,
    predicate: "runs_commemoration_program",
    object_value: "induction_program",
    normalization_confidence: "high",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_WEBSITE",
    qualifiers: [{ key: "recurrence", value_type: "string", value: "periodic" }]
  });

  assert.equal(a.status, "eligible");
  assert.equal(b.status, "eligible");
  assert.equal(a.claim.claim_id, b.claim.claim_id);
  assert.notEqual(a.claim.claim_fingerprint, b.claim.claim_fingerprint);
  assert.notEqual(computeContentHash(a.claim), computeContentHash(b.claim));
});

test("operates_event_program recurrence NON-IDENTITY: claim_id stable, fingerprint changes", () => {
  const now = new Date().toISOString();

  const a = buildProgramSurfaceClaimV1({
    evidence_version_ref: EVIDENCE,
    retrieved_at_iso: now,
    subject: ORG,
    predicate: "operates_event_program",
    object_value: "event_series",
    normalization_confidence: "high",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_EVENT_PAGE",
    qualifiers: [{ key: "recurrence", value_type: "string", value: "annual" }]
  });

  const b = buildProgramSurfaceClaimV1({
    evidence_version_ref: EVIDENCE,
    retrieved_at_iso: now,
    subject: ORG,
    predicate: "operates_event_program",
    object_value: "event_series",
    normalization_confidence: "high",
    evidence_domain: "EXTERNAL",
    external_source_class: "OFFICIAL_EVENT_PAGE",
    qualifiers: [{ key: "recurrence", value_type: "string", value: "periodic" }]
  });

  assert.equal(a.status, "eligible");
  assert.equal(b.status, "eligible");
  assert.equal(a.claim.claim_id, b.claim.claim_id);
  assert.notEqual(a.claim.claim_fingerprint, b.claim.claim_fingerprint);
});

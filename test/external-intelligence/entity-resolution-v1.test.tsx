import test from "node:test";
import assert from "node:assert/strict";

import { normalizeOrganizationNameForCandidateCompareV1 } from "@/lib/external-intelligence/entities/entity-candidate-normalization-v1";
import {
  resolveEntityRefV1,
  type EntityRepoLikeV1,
  type ResolutionLinkRepoLikeV1
} from "@/lib/external-intelligence/entities/entity-ref-resolution-overlay-v1";
import { decideResolutionOutcomeV1 } from "@/lib/external-intelligence/entities/entity-resolution-policy-v1";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";

test("candidate normalization: Nike vs NIKE -> same compare_key", () => {
  const a = normalizeOrganizationNameForCandidateCompareV1("Nike");
  const b = normalizeOrganizationNameForCandidateCompareV1("NIKE");
  assert.equal(a.compare_key, b.compare_key);
});

test("candidate normalization: Nike vs Nike, Inc. -> same compare_key", () => {
  const a = normalizeOrganizationNameForCandidateCompareV1("Nike");
  const b = normalizeOrganizationNameForCandidateCompareV1("Nike, Inc.");
  assert.equal(a.compare_key, b.compare_key);
});

test("overlay: unresolved when no link exists", async () => {
  const ref: EntityRef = {
    entity_id: "provisional:organization:deadbeefdeadbeefdeadbeef",
    entity_type: "organization",
    canonical_name: "Nike",
    aliases: [],
    source_specific_ids: {},
    resolution_status: "unresolved",
    resolution_confidence: {
      level: "possible",
      bounded_score: null,
      reasons: [],
      blockers: [],
      supporting_reference_ids: [],
      contradicting_reference_ids: [],
      missing_evidence_ids: []
    },
    ambiguity_flags: [],
    possible_entity_ids: [],
    alias_provenance: [],
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  };

  const out = await resolveEntityRefV1({
    entity_ref: ref,
    deps: {
      linkRepo: {
        getResolvedByProvisionalId: async () => null
      } satisfies ResolutionLinkRepoLikeV1
    }
  });

  assert.equal(out.resolution_status, "unresolved");
  assert.equal(out.canonical_entity, null);
});

test("overlay: resolved when a resolved link exists and canonical entity loads", async () => {
  const ref: EntityRef = {
    entity_id: "provisional:organization:deadbeefdeadbeefdeadbeef",
    entity_type: "organization",
    canonical_name: "Nike",
    aliases: [],
    source_specific_ids: {},
    resolution_status: "unresolved",
    resolution_confidence: {
      level: "possible",
      bounded_score: null,
      reasons: [],
      blockers: [],
      supporting_reference_ids: [],
      contradicting_reference_ids: [],
      missing_evidence_ids: []
    },
    ambiguity_flags: [],
    possible_entity_ids: [],
    alias_provenance: [],
    entity_resolution_version: "entity_resolution_v1.provisional_only",
    last_verified_at: null,
    valid_from: null,
    valid_until: null
  };

  const out = await resolveEntityRefV1({
    entity_ref: ref,
    deps: {
      linkRepo: {
        getResolvedByProvisionalId: async () => ({
          link_id: "link:1",
          provisional_entity_id: ref.entity_id,
          canonical_entity_id: "org:123",
          status: "resolved",
          confidence_json: { level: "known" },
          resolution_method: "manual_confirm_same",
          provenance_json: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      } satisfies ResolutionLinkRepoLikeV1,
      entityRepo: {
        getById: async () => ({
          entity_id: "org:123",
          entity_type: "organization",
          canonical_name: "Nike",
          resolution_status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      } satisfies EntityRepoLikeV1
    }
  });

  assert.equal(out.resolution_status, "resolved");
  assert.equal(out.canonical_entity?.entity_id, "org:123");
});

test("policy: name normalization alone never AUTO_RESOLVE", () => {
  const out = decideResolutionOutcomeV1({
    evidence: [
      {
        evidence_class: "name_and_context",
        strength: "weak",
        description: "nike vs nike, inc normalized compare key match"
      }
    ],
    has_conflicting_strong_identifiers: false
  });

  assert.equal(out.outcome, "SUGGESTED_MATCH");
});

test("policy: conflicting strong identifiers -> CONFLICT", () => {
  const out = decideResolutionOutcomeV1({
    evidence: [
      {
        evidence_class: "verified_external_identifier",
        strength: "strong",
        description: "crm_id=1"
      }
    ],
    has_conflicting_strong_identifiers: true
  });

  assert.equal(out.outcome, "CONFLICT");
});

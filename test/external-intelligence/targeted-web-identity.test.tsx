import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeUrlV1, computeTargetedWebEvidenceReferenceIdV1, computeTargetedWebSourceIdV1 } from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import { buildProvidesServiceToClaimV1 } from "@/lib/external-intelligence/contextual-claims/contextual-claims-builders-v1";

test("TARGETED RESEARCH PREVIEW IDENTITY: targeted-web EvidenceReference ID is derived from canonical domain+url", () => {
  const raw = "https://www.sportspro.com/announcements/spotlight-agency/ten-toes-appointed-as-premier-padels-lead-digital-marketing-in-multi-year-agreement/";
  const canon = canonicalizeUrlV1(raw);
  assert.equal(canon.domain, "www.sportspro.com");

  const source_id = computeTargetedWebSourceIdV1(canon.domain);
  assert.equal(source_id, "research.web.host:www.sportspro.com");

  const evidence_reference_id = computeTargetedWebEvidenceReferenceIdV1({ source_id, canonical_url: canon.canonical_url });
  assert.equal(evidence_reference_id, "ev_68a8449421a6b986a5e85c0e");
});

test("TARGETED RESEARCH PREVIEW IDENTITY: provides_service_to claim_id changes when evidence_reference_id changes", () => {
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

  const mkEvidenceRef = (object_id: string) =>
    ({
      object_type: "evidence_reference",
      object_id,
      version_id: null,
      content_hash: "a".repeat(64),
      schema_version: "evidence_reference_v1",
      policy_version: "legal_policy",
      created_at: new Date().toISOString()
    }) as const;

  const c1 = buildProvidesServiceToClaimV1({
    evidence_version_ref: mkEvidenceRef("ev_a"),
    retrieved_at_iso: new Date().toISOString(),
    provider,
    client,
    service_scope: "content"
  });

  const c2 = buildProvidesServiceToClaimV1({
    evidence_version_ref: mkEvidenceRef("ev_b"),
    retrieved_at_iso: new Date().toISOString(),
    provider,
    client,
    service_scope: "content"
  });

  assert.notEqual(c1.claim_id, c2.claim_id);
});


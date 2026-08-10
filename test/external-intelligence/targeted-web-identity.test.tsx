import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeUrlV1, computeTargetedWebEvidenceReferenceIdV1, computeTargetedWebSourceIdV1 } from "@/lib/external-intelligence/targeted-research/url-canonicalization-v1";
import { createTargetedWebStructuredMetadataRetainedPayloadHashV1 } from "@/lib/external-intelligence/targeted-research/targeted-web-structured-metadata-retained-payload-hash-v1";
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

test("TARGETED_WEB structured_metadata retained payload hash: includes meta_description and is deterministic", () => {
  const base = {
    identity_url: "https://premierpadel.com/en",
    title: "Premier Padel | News, Calendar, Scores & Results",
    meta_description:
      "Follow Premier Padel, the world’s leading professional Padel tour. Explore rankings, tournament schedules, highlights, news and exclusive player content.",
    og_site_name: null,
    og_title: "Premier Padel | News, Calendar, Scores & Results",
    jsonld_types: [] as string[]
  };

  const h1 = createTargetedWebStructuredMetadataRetainedPayloadHashV1(base);
  const h2 = createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base });
  assert.equal(h1, h2);

  const h3 = createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, meta_description: base.meta_description + "!" });
  assert.notEqual(h1, h3);
});

test("TARGETED_WEB structured_metadata retained payload hash: title/og fields/types changes alter hash; type ordering does not", () => {
  const base = {
    identity_url: "https://premierpadel.com/en",
    title: "Premier Padel | News, Calendar, Scores & Results",
    meta_description: "Follow Premier Padel, the world’s leading professional Padel tour.",
    og_site_name: null as string | null,
    og_title: "Premier Padel | News, Calendar, Scores & Results",
    jsonld_types: [] as string[]
  };

  const h0 = createTargetedWebStructuredMetadataRetainedPayloadHashV1(base);
  assert.notEqual(h0, createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, title: base.title + "!" }));
  assert.notEqual(
    h0,
    createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, og_title: (base.og_title ?? "") + "!" })
  );
  assert.notEqual(h0, createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, og_site_name: "Premier Padel" }));
  assert.notEqual(h0, createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, jsonld_types: ["SportsOrganization"] }));

  const ha = createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, jsonld_types: ["A", "B", "A"] });
  const hb = createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, jsonld_types: ["B", "A"] });
  assert.equal(ha, hb, "jsonld_types order and duplicates should not affect hash");
});

test("TARGETED_WEB structured_metadata retained payload hash: identity_url canonicalization avoids redirect/utm churn", () => {
  const base = {
    title: "T",
    meta_description: "D",
    og_site_name: null as string | null,
    og_title: null as string | null,
    jsonld_types: [] as string[]
  };

  const h1 = createTargetedWebStructuredMetadataRetainedPayloadHashV1({ ...base, identity_url: "https://premierpadel.com/en" });
  const h2 = createTargetedWebStructuredMetadataRetainedPayloadHashV1({
    ...base,
    identity_url: "https://premierpadel.com/en?utm_source=x#fragment"
  });
  assert.equal(h1, h2);
});

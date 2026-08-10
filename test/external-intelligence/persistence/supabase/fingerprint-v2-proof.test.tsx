import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  createClaimVersionContentHashV2,
  createEvidenceRetainedPayloadHashV2,
  createEvidenceVersionFingerprintV2,
  EI_FINGERPRINT_CONTRACT_V2,
  type EvidenceRetainedPayloadV2
} from "@/lib/external-intelligence/hashing/fingerprint-v2";

import { createDisposableDb } from "./_rpc-disposable-db";

const A5 = path.join(process.cwd(), "supabase/migrations/20260804010200_external_intelligence_phase_a5.sql");
const A61 = path.join(process.cwd(), "supabase/migrations/20260804010300_external_intelligence_phase_a6_transaction_rpcs.sql");
const V2 = path.join(process.cwd(), "supabase/migrations/20260810_external_intelligence_fingerprint_v2.sql");
const V2_CLAIM_SEMANTIC = path.join(process.cwd(), "supabase/migrations/20260810_external_intelligence_claim_hash_v2_semantic.sql");

function jsonLiteral(obj: unknown): string {
  // Safe for fixtures: no embedded newlines, deterministic key order not required (DB reads by keys).
  return JSON.stringify(obj).replace(/'/g, "''");
}

test("fingerprint v2: TS framing == DB framing (retained payload + evidence + claim)", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);
  db.file(V2);
  db.file(V2_CLAIM_SEMANTIC);

  const premierRetained: EvidenceRetainedPayloadV2 = {
    lane: "structured_metadata",
    identity_url: "https://premierpadel.com/en",
    title: "Premier Padel | News, Calendar, Scores & Results",
    meta_description:
      "Follow Premier Padel, the world’s leading professional Padel tour. Explore rankings, tournament schedules, highlights, news and exclusive player content.",
    og_site_name: null,
    og_title: "Premier Padel | News, Calendar, Scores & Results",
    jsonld_types: []
  };

  const premierEvidencePayload = {
    schema_version: "evidence/v1",
    source_id: "premierpadel",
    source_config_version: "v1",
    legal_policy_version: "legal/v1",

    evidence_type: "report",
    access_classification: "public",
    retention_policy: "structured_metadata",

    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://premierpadel.com/en",

    published_at: null,
    event_time: null,

    excerpt_or_summary_reference: null,
    source_credibility_prior: "high",

    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,

    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],

    retained_payload: premierRetained
  };

  const tsPremierInner = createEvidenceRetainedPayloadHashV2(premierRetained);
  const tsPremierOuter = createEvidenceVersionFingerprintV2({
    schema_version: premierEvidencePayload.schema_version,
    source_id: premierEvidencePayload.source_id,
    source_config_version: premierEvidencePayload.source_config_version,
    legal_policy_version: premierEvidencePayload.legal_policy_version,

    evidence_type: premierEvidencePayload.evidence_type,
    access_classification: premierEvidencePayload.access_classification,
    retention_policy: premierEvidencePayload.retention_policy,

    source_set_id: premierEvidencePayload.source_set_id,
    source_artifact_identifier: premierEvidencePayload.source_artifact_identifier,
    source_url_or_reference: premierEvidencePayload.source_url_or_reference,

    published_at: premierEvidencePayload.published_at,
    event_time: premierEvidencePayload.event_time,

    excerpt_or_summary_reference: premierEvidencePayload.excerpt_or_summary_reference,
    source_credibility_prior: premierEvidencePayload.source_credibility_prior,

    correction_status: premierEvidencePayload.correction_status,
    retraction_status: premierEvidencePayload.retraction_status,
    supersedes_evidence_reference_id: premierEvidencePayload.supersedes_evidence_reference_id,

    corroborating_evidence_reference_ids: premierEvidencePayload.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: premierEvidencePayload.contradicting_evidence_reference_ids,

    retained_payload_hash_v2: tsPremierInner
  });

  const dbPremierInner = db.psql(
    `select public.ei_compute_evidence_retained_payload_hash_v2('${jsonLiteral(premierRetained)}'::jsonb);`
  );
  assert.equal(dbPremierInner, tsPremierInner);

  const dbPremierOuter = db.psql(
    `select public.ei_compute_evidence_version_fingerprint_v2('${jsonLiteral(premierEvidencePayload)}'::jsonb);`
  );
  assert.equal(dbPremierOuter, tsPremierOuter);

  // Quote-only fixture
  const sportsProRetained: EvidenceRetainedPayloadV2 = {
    lane: "quote_only",
    source_url: "https://www.sportspromedia.com/",
    quote_text: "A representative quote used for fixture testing.",
    quote_context: "SportsPro quote-only fixture",
    title: "SportsPro"
  };
  const sportsProEvidencePayload = {
    ...premierEvidencePayload,
    source_id: "sportspromedia",
    source_url_or_reference: "https://www.sportspromedia.com/",
    retention_policy: "quote_only",
    retained_payload: sportsProRetained
  };

  const tsSportsInner = createEvidenceRetainedPayloadHashV2(sportsProRetained);
  const tsSportsOuter = createEvidenceVersionFingerprintV2({
    schema_version: sportsProEvidencePayload.schema_version,
    source_id: sportsProEvidencePayload.source_id,
    source_config_version: sportsProEvidencePayload.source_config_version,
    legal_policy_version: sportsProEvidencePayload.legal_policy_version,
    evidence_type: sportsProEvidencePayload.evidence_type,
    access_classification: sportsProEvidencePayload.access_classification,
    retention_policy: sportsProEvidencePayload.retention_policy,
    source_set_id: sportsProEvidencePayload.source_set_id,
    source_artifact_identifier: sportsProEvidencePayload.source_artifact_identifier,
    source_url_or_reference: sportsProEvidencePayload.source_url_or_reference,
    published_at: sportsProEvidencePayload.published_at,
    event_time: sportsProEvidencePayload.event_time,
    excerpt_or_summary_reference: sportsProEvidencePayload.excerpt_or_summary_reference,
    source_credibility_prior: sportsProEvidencePayload.source_credibility_prior,
    correction_status: sportsProEvidencePayload.correction_status,
    retraction_status: sportsProEvidencePayload.retraction_status,
    supersedes_evidence_reference_id: sportsProEvidencePayload.supersedes_evidence_reference_id,
    corroborating_evidence_reference_ids: sportsProEvidencePayload.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: sportsProEvidencePayload.contradicting_evidence_reference_ids,
    retained_payload_hash_v2: tsSportsInner
  });

  assert.equal(
    db.psql(`select public.ei_compute_evidence_retained_payload_hash_v2('${jsonLiteral(sportsProRetained)}'::jsonb);`),
    tsSportsInner
  );
  assert.equal(
    db.psql(
      `select public.ei_compute_evidence_version_fingerprint_v2('${jsonLiteral(sportsProEvidencePayload)}'::jsonb);`
    ),
    tsSportsOuter
  );

  // RSS/link-only fixture
  const rssRetained: EvidenceRetainedPayloadV2 = {
    lane: "link_only",
    source_url: "https://example.com/rss/item-1",
    title: "Example RSS Item",
    summary: "Example RSS summary."
  };
  const rssEvidencePayload = {
    ...premierEvidencePayload,
    source_id: "rss",
    source_url_or_reference: rssRetained.source_url,
    retention_policy: "link_only",
    retained_payload: rssRetained
  };

  const tsRssInner = createEvidenceRetainedPayloadHashV2(rssRetained);
  const tsRssOuter = createEvidenceVersionFingerprintV2({
    schema_version: rssEvidencePayload.schema_version,
    source_id: rssEvidencePayload.source_id,
    source_config_version: rssEvidencePayload.source_config_version,
    legal_policy_version: rssEvidencePayload.legal_policy_version,
    evidence_type: rssEvidencePayload.evidence_type,
    access_classification: rssEvidencePayload.access_classification,
    retention_policy: rssEvidencePayload.retention_policy,
    source_set_id: rssEvidencePayload.source_set_id,
    source_artifact_identifier: rssEvidencePayload.source_artifact_identifier,
    source_url_or_reference: rssEvidencePayload.source_url_or_reference,
    published_at: rssEvidencePayload.published_at,
    event_time: rssEvidencePayload.event_time,
    excerpt_or_summary_reference: rssEvidencePayload.excerpt_or_summary_reference,
    source_credibility_prior: rssEvidencePayload.source_credibility_prior,
    correction_status: rssEvidencePayload.correction_status,
    retraction_status: rssEvidencePayload.retraction_status,
    supersedes_evidence_reference_id: rssEvidencePayload.supersedes_evidence_reference_id,
    corroborating_evidence_reference_ids: rssEvidencePayload.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: rssEvidencePayload.contradicting_evidence_reference_ids,
    retained_payload_hash_v2: tsRssInner
  });

  assert.equal(
    db.psql(`select public.ei_compute_evidence_retained_payload_hash_v2('${jsonLiteral(rssRetained)}'::jsonb);`),
    tsRssInner
  );
  assert.equal(
    db.psql(`select public.ei_compute_evidence_version_fingerprint_v2('${jsonLiteral(rssEvidencePayload)}'::jsonb);`),
    tsRssOuter
  );

  // Claim fixture (Program Surface)
  const claimPayload = {
    claim_id: "claim_pp_1",
    claim_fingerprint: "1".repeat(64),
    evidence_reference_id: "ev_pp_1",
    subject: null,
    predicate: "has_program_surface",
    object: {
      kind: "literal",
      value: "Premier Padel",
      value_type: "string",
      unit: null,
      language: null
    },
    event_time: null,
    announcement_time: null,
    retrieved_at: "2026-08-10T17:53:00.000Z",
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim/v1",
    interpretation_policy_version: "signal-interpretation/v1"
  };

  const tsClaimHash = createClaimVersionContentHashV2({
    claim_id: claimPayload.claim_id,
    claim_fingerprint: claimPayload.claim_fingerprint,
    evidence_reference_id: claimPayload.evidence_reference_id,
    subject_entity_id: null,
    predicate: claimPayload.predicate,
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: claimPayload.object.value,
    object_literal_unit: null,
    object_literal_value_type: claimPayload.object.value_type,
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: claimPayload.observed_vs_inferred,
    verification_state: claimPayload.verification_state,
    extraction_confidence_level: claimPayload.extraction_confidence.level,
    extraction_confidence_reasons: claimPayload.extraction_confidence.reasons,
    contradiction_state: claimPayload.contradiction_state,
    correction_state: claimPayload.correction_state,
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: claimPayload.schema_version,
    interpretation_policy_version: claimPayload.interpretation_policy_version
  });

  const dbClaimHash = db.psql(`select public.ei_compute_claim_version_content_hash_v2('${jsonLiteral(claimPayload)}'::jsonb);`);
  assert.equal(dbClaimHash, tsClaimHash);
});

test("rpc hardening: evidence + claim V2 accept/reject + historical replays", () => {
  const db = createDisposableDb();
  db.file(A5);
  db.psql(
    "do $$begin create role anon; exception when duplicate_object then null; end$$; do $$begin create role authenticated; exception when duplicate_object then null; end$$; do $$begin create role service_role login; exception when duplicate_object then null; end$$;"
  );
  db.file(A61);
  db.file(V2);
  db.file(V2_CLAIM_SEMANTIC);

  const retained: EvidenceRetainedPayloadV2 = {
    lane: "structured_metadata",
    identity_url: "https://premierpadel.com/en",
    title: "Premier Padel | News, Calendar, Scores & Results",
    meta_description:
      "Follow Premier Padel, the world’s leading professional Padel tour. Explore rankings, tournament schedules, highlights, news and exclusive player content.",
    og_site_name: null,
    og_title: "Premier Padel | News, Calendar, Scores & Results",
    jsonld_types: []
  };

  const evPayload = {
    schema_version: "evidence/v1",
    source_id: "premierpadel",
    source_config_version: "v1",
    legal_policy_version: "legal/v1",
    evidence_type: "report",
    access_classification: "public",
    retention_policy: "structured_metadata",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: "https://premierpadel.com/en",
    published_at: null,
    event_time: null,
    excerpt_or_summary_reference: null,
    source_credibility_prior: "high",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: [],
    retained_payload: retained
  };

  const inner = createEvidenceRetainedPayloadHashV2(retained);
  const outer = createEvidenceVersionFingerprintV2({
    schema_version: evPayload.schema_version,
    source_id: evPayload.source_id,
    source_config_version: evPayload.source_config_version,
    legal_policy_version: evPayload.legal_policy_version,
    evidence_type: evPayload.evidence_type,
    access_classification: evPayload.access_classification,
    retention_policy: evPayload.retention_policy,
    source_set_id: evPayload.source_set_id,
    source_artifact_identifier: evPayload.source_artifact_identifier,
    source_url_or_reference: evPayload.source_url_or_reference,
    published_at: evPayload.published_at,
    event_time: evPayload.event_time,
    excerpt_or_summary_reference: evPayload.excerpt_or_summary_reference,
    source_credibility_prior: evPayload.source_credibility_prior,
    correction_status: evPayload.correction_status,
    retraction_status: evPayload.retraction_status,
    supersedes_evidence_reference_id: evPayload.supersedes_evidence_reference_id,
    corroborating_evidence_reference_ids: evPayload.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: evPayload.contradicting_evidence_reference_ids,
    retained_payload_hash_v2: inner
  });

  // valid Evidence V2: ACCEPT
  const ok = () =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_pp_1','${outer}','v1','premierpadel','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(evPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    );
  assert.ok(ok().includes("ev_pp_1"));

  // wrong inner hash (mutate retained payload) => REJECT
  const badInnerPayload = {
    ...evPayload,
    retained_payload: { ...retained, meta_description: retained.meta_description + " (changed)" }
  };
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_bad_inner','${outer}','v1','premierpadel','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(badInnerPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    )
  );

  // wrong outer hash => REJECT
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_bad_outer','${"0".repeat(64)}','v1','premierpadel','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(evPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    )
  );

  // Contract-Y (outer == inner) style => REJECT
  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_contract_y','${inner}','v1','premierpadel','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(evPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    )
  );

  // historical Contract-X replay: PASS
  const hist = () =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_hist','${"a".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'{"ok":true}'::jsonb,
        'retain',null,false,null,null,null,true
      );`
    );
  assert.ok(hist().includes("ev_hist"));
  assert.ok(hist().includes("t"));

  // historical Contract-Y replay: PASS (legacy path)
  const histY = () =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_evidence_reference_v1(
        'ev_hist_y','${"b".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
        null,null,null,'[]'::jsonb,'{"outer_equals_inner":true}'::jsonb,
        'retain',null,false,null,null,null,true
      );`
    );
  assert.ok(histY().includes("ev_hist_y"));

  // changed historical Evidence creates NEW V2 version without rewriting old row
  db.psqlAs(
    "service_role",
    `select * from persist_external_evidence_reference_v1(
      'ev_mix','${"c".repeat(64)}','v1','s1','v1','legal/v1','[]'::jsonb,
      null,null,null,'[]'::jsonb,'{"legacy":1}'::jsonb,
      'retain',null,false,null,null,null,true
    );`
  );
  const mixV2Payload = { ...evPayload, source_id: "premierpadel" };
  const mixInner = createEvidenceRetainedPayloadHashV2(retained);
  const mixOuter = createEvidenceVersionFingerprintV2({
    schema_version: mixV2Payload.schema_version,
    source_id: mixV2Payload.source_id,
    source_config_version: mixV2Payload.source_config_version,
    legal_policy_version: mixV2Payload.legal_policy_version,
    evidence_type: mixV2Payload.evidence_type,
    access_classification: mixV2Payload.access_classification,
    retention_policy: mixV2Payload.retention_policy,
    source_set_id: mixV2Payload.source_set_id,
    source_artifact_identifier: mixV2Payload.source_artifact_identifier,
    source_url_or_reference: mixV2Payload.source_url_or_reference,
    published_at: mixV2Payload.published_at,
    event_time: mixV2Payload.event_time,
    excerpt_or_summary_reference: mixV2Payload.excerpt_or_summary_reference,
    source_credibility_prior: mixV2Payload.source_credibility_prior,
    correction_status: mixV2Payload.correction_status,
    retraction_status: mixV2Payload.retraction_status,
    supersedes_evidence_reference_id: mixV2Payload.supersedes_evidence_reference_id,
    corroborating_evidence_reference_ids: mixV2Payload.corroborating_evidence_reference_ids,
    contradicting_evidence_reference_ids: mixV2Payload.contradicting_evidence_reference_ids,
    retained_payload_hash_v2: mixInner
  });
  db.psqlAs(
    "service_role",
    `select * from persist_external_evidence_reference_v1(
      'ev_mix','${mixOuter}','v1','premierpadel','v1','legal/v1','[]'::jsonb,
      null,null,null,'[]'::jsonb,'${jsonLiteral(mixV2Payload)}'::jsonb,
      'retain',null,false,null,null,null,true,
      '${EI_FINGERPRINT_CONTRACT_V2}'
    );`
  );
  assert.equal(db.psql("select count(*) from external_evidence_reference_versions_v1 where evidence_reference_id='ev_mix';"), "2");
  assert.equal(
    db.psql(
      "select coalesce(max(fingerprint_contract_version),'null') from external_evidence_reference_versions_v1 where evidence_reference_id='ev_mix' and content_hash='" +
        "c".repeat(64) +
        "';"
    ),
    "null"
  );

  // Claim V2: valid ACCEPT, bad hash REJECT
  const claimPayload = {
    claim_id: "claim_pp_1",
    claim_fingerprint: "1".repeat(64),
    evidence_reference_id: "ev_pp_1",
    subject: null,
    predicate: "has_program_surface",
    object: {
      kind: "literal",
      value: "Premier Padel",
      value_type: "string",
      unit: null,
      language: null
    },
    event_time: null,
    announcement_time: null,
    retrieved_at: "2026-08-10T17:53:00.000Z",
    observed_vs_inferred: "observed",
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    contradiction_state: "none",
    correction_state: "none",
    relevance_window: { start: null, end: null },
    schema_version: "claim/v1",
    interpretation_policy_version: "signal-interpretation/v1"
  };

  const claimHash = createClaimVersionContentHashV2({
    claim_id: claimPayload.claim_id,
    claim_fingerprint: claimPayload.claim_fingerprint,
    evidence_reference_id: claimPayload.evidence_reference_id,
    subject_entity_id: null,
    predicate: claimPayload.predicate,
    object_kind: "literal",
    object_entity_id: null,
    object_literal_value: claimPayload.object.value,
    object_literal_unit: null,
    object_literal_value_type: claimPayload.object.value_type,
    object_literal_language: null,
    event_time: null,
    announcement_time: null,
    observed_vs_inferred: claimPayload.observed_vs_inferred,
    verification_state: claimPayload.verification_state,
    extraction_confidence_level: claimPayload.extraction_confidence.level,
    extraction_confidence_reasons: claimPayload.extraction_confidence.reasons,
    contradiction_state: claimPayload.contradiction_state,
    correction_state: claimPayload.correction_state,
    relevance_window_start: null,
    relevance_window_end: null,
    schema_version: claimPayload.schema_version,
    interpretation_policy_version: claimPayload.interpretation_policy_version
  });

  const claimOk = () =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_claim_v1(
        'claim_pp_1','${claimHash}','v1','${claimPayload.claim_fingerprint}','signal-interpretation/v1','iph1',
        'ev_pp_1','${outer}',
        '{"object_type":"evidence_reference","object_id":"ev_pp_1","content_hash":"${outer}"}'::jsonb,
        '[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(claimPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        'supported_by','provenance/v1','ph1',
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    );
  assert.ok(claimOk().includes("claim_pp_1"));

  assert.throws(() =>
    db.psqlAs(
      "service_role",
      `select * from persist_external_claim_v1(
        'claim_bad','${"0".repeat(64)}','v1','${claimPayload.claim_fingerprint}','signal-interpretation/v1','iph1',
        'ev_pp_1','${outer}',
        '{"object_type":"evidence_reference","object_id":"ev_pp_1","content_hash":"${outer}"}'::jsonb,
        '[]'::jsonb,
        null,null,null,'[]'::jsonb,'${jsonLiteral(claimPayload)}'::jsonb,
        'retain',null,false,null,null,null,true,
        'supported_by','provenance/v1','ph1',
        '${EI_FINGERPRINT_CONTRACT_V2}'
      );`
    )
  );
});

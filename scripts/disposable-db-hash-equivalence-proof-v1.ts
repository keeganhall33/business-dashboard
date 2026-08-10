#!/usr/bin/env node
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { createTargetedWebStructuredMetadataRetainedPayloadHashV1 } from "@/lib/external-intelligence/targeted-research/targeted-web-structured-metadata-retained-payload-hash-v1";
import { createEvidenceReferenceFingerprint } from "@/lib/external-intelligence/hashing/fingerprints";
import { computeContentHash } from "@/lib/external-intelligence/contracts/version-ref";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";

function sh(cmd: string, args: string[], opts?: { env?: Record<string, string> }) {
  return execFileSync(cmd, args, { stdio: "pipe", encoding: "utf8", env: { ...process.env, ...(opts?.env ?? {}) } }).trim();
}

function psql(port: number, sql: string) {
  return sh("psql", ["-h", "127.0.0.1", "-p", String(port), "-d", "postgres", "-tA", "-c", sql]);
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "oc-pg-"));
  const dataDir = join(dir, "data");
  const port = 55432;

  try {
    const pgEnv = { LC_ALL: "C", LANG: "C" };
    sh("initdb", ["-D", dataDir, "-A", "trust", "-U", "postgres"], { env: pgEnv });

    // Start postgres (TCP on localhost) for deterministic psql access.
    sh(
      "pg_ctl",
      [
      "-D",
      dataDir,
      "-o",
      `-p ${port} -h 127.0.0.1 -k ${dir}`,
      "-w",
      "start"
      ],
      { env: pgEnv }
    );

    // Wait until ready.
    for (let i = 0; i < 50; i++) {
      try {
        psql(port, "select 1;");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Minimal DB setup: we only need hashing equivalence, not the full supabase schema.
    psql(
      port,
      [
        "create schema if not exists extensions;",
        "create extension if not exists pgcrypto with schema extensions;",
        "create or replace function ei_canonical_json_sha256_hex_v1(in_value jsonb) returns text language sql immutable as $$ select encode(extensions.digest(coalesce(in_value, '{}'::jsonb)::text, 'sha256'),'hex'); $$;"
      ].join("\n")
    );

    // Evidence: Premier Padel structured_metadata inner + outer.
    const retainedPayload = {
      v: "targeted_web_structured_metadata_payload_v1",
      identity_canonical_url: "https://premierpadel.com/en",
      title: "Premier Padel | News, Calendar, Scores & Results",
      meta_description:
        "Follow Premier Padel, the world’s leading professional Padel tour. Explore rankings, tournament schedules, highlights, news and exclusive player content.",
      og_site_name: null,
      og_title: "Premier Padel | News, Calendar, Scores & Results",
      jsonld_types: [] as string[]
    };

    const tsInner = createTargetedWebStructuredMetadataRetainedPayloadHashV1({
      identity_url: retainedPayload.identity_canonical_url,
      title: retainedPayload.title,
      meta_description: retainedPayload.meta_description,
      og_site_name: retainedPayload.og_site_name,
      og_title: retainedPayload.og_title,
      jsonld_types: retainedPayload.jsonld_types
    });

    const dbInner = psql(port, `select ei_canonical_json_sha256_hex_v1('${JSON.stringify(retainedPayload)}'::jsonb);`);

    assert.equal(tsInner, dbInner, "TS↔DB inner retained_payload_hash mismatch");

    const semanticTuple = {
      source_id: "research.web.host:premierpadel.com",
      source_config_version: "targeted_web.preview_v1",
      source_set_id: null,
      source_artifact_identifier: null,
      source_url_or_reference: "https://premierpadel.com/en",
      content_hash: tsInner,
      retrieved_at: "2026-08-10T00:00:00.000Z",
      published_at: null,
      event_time: null,
      evidence_type: "other",
      access_classification: "public",
      legal_policy_version: "targeted_web.preview_only.v1",
      retention_policy: "link_only",
      excerpt_or_summary_reference: null,
      source_credibility_prior: "high",
      correction_status: "none",
      retraction_status: "none",
      supersedes_evidence_reference_id: null,
      schema_version: "evidence_reference_v1"
    };
    const tsOuter = createEvidenceReferenceFingerprint(semanticTuple);
    const outerProjection = {
      source_id: semanticTuple.source_id,
      source_config_version: semanticTuple.source_config_version,
      source_set_id: semanticTuple.source_set_id,
      source_artifact_identifier: semanticTuple.source_artifact_identifier,
      source_url_or_reference: semanticTuple.source_url_or_reference,
      content_hash: semanticTuple.content_hash,
      published_at: semanticTuple.published_at,
      event_time: semanticTuple.event_time,
      evidence_type: semanticTuple.evidence_type,
      access_classification: semanticTuple.access_classification,
      legal_policy_version: semanticTuple.legal_policy_version,
      retention_policy: semanticTuple.retention_policy,
      excerpt_or_summary_reference: semanticTuple.excerpt_or_summary_reference,
      source_credibility_prior: semanticTuple.source_credibility_prior,
      correction_status: semanticTuple.correction_status,
      retraction_status: semanticTuple.retraction_status,
      supersedes_evidence_reference_id: semanticTuple.supersedes_evidence_reference_id,
      schema_version: semanticTuple.schema_version
    };
    const dbOuter = psql(port, `select ei_canonical_json_sha256_hex_v1('${JSON.stringify(outerProjection)}'::jsonb);`);
    assert.equal(tsOuter, dbOuter, "TS↔DB outer evidence fingerprint mismatch");

    // Claim: Premier Padel program surface claim (hash only).
    const claim = {
      claim_id: "cl_53c94cd6d361b5fd871e27e8",
      claim_fingerprint: "1c5c380c366b77c88bd050b8be0214f0cd4d7479197a66ecd467162f3a012963",
      evidence_reference_id: "ev_d7ff657c5f2040c6cf6f9b59",
      subject: { entity_id: "provisional:organization:855052d8c715418165b6cb72", entity_type: "organization", canonical_name: "Premier Padel" },
      predicate: "operates_event_program",
      object: { kind: "literal", value: "tour", value_type: "string" },
      event_time: null,
      announcement_time: null,
      retrieved_at: "2026-08-10T00:00:00.000Z",
      observed_vs_inferred: "observed",
      verification_state: "unverified",
      extraction_confidence: { level: "high", reasons: [] },
      contradiction_state: "none",
      correction_state: "none",
      relevance_window: { start: null, end: null },
      schema_version: "claim_v1",
      interpretation_policy_version: "program_surface_builders_v1"
    } as unknown as Claim;
    const tsClaimHash = computeContentHash(claim);
    const dbClaimHash = psql(port, `select ei_canonical_json_sha256_hex_v1('${JSON.stringify(claim)}'::jsonb);`);
    assert.equal(tsClaimHash, dbClaimHash, "TS↔DB claim content hash mismatch");

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          premier_padel: {
            retained_payload_hash: tsInner,
            evidence_outer_fingerprint: tsOuter,
            claim_content_hash: tsClaimHash
          }
        },
        null,
        2
      )
    );

    sh("pg_ctl", ["-D", dataDir, "-w", "stop"], { env: pgEnv });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

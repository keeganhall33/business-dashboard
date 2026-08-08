/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";

function mkBoardroomEvidence(input: { id: string; url: string; title: string; excerpt: string }): EvidenceReference {
  return {
    schema_version: "evidence_reference_v1",
    evidence_reference_id: input.id,
    source_id: "sports_business.boardroom",
    source_config_version: "v1",
    source_set_id: null,
    source_artifact_identifier: null,
    source_url_or_reference: input.url,
    content_hash: "0".repeat(64),
    retrieved_at: "2026-08-08T00:00:00.000Z",
    published_at: null,
    event_time: null,
    evidence_type: "report" as any,
    access_classification: "public" as any,
    legal_policy_version: "boardroom.rss.link_only.v1",
    retention_policy: "link_only" as any,
    excerpt_or_summary_reference: null,
    source_credibility_prior: "medium" as any,
    correction_status: "none" as any,
    retraction_status: "none" as any,
    supersedes_evidence_reference_id: null,
    provenance_metadata: {
      title: input.title,
      excerpt: input.excerpt
    },
    credibility: { level: "medium", bounded_score: null, reasons: [] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: []
  };
}

test("Boardroom downstream: explicit partnership excerpt qualifies to partnered_with claim; no milestones", () => {
  const out = qualifyEvidenceReferenceDownstreamV1({
    evidence: mkBoardroomEvidence({
      id: "ev_2623049899a3bd37abf05087",
      url: "https://boardroom.tv/a24-ai-google-deepmind-movies-films/",
      title: "A24 Built Its Brand on Artists; Now It's Betting on AI",
      excerpt: "<p>A24's $75 million partnership with Google's DeepMind may make business sense.</p>"
    }),
    now_iso: "2026-08-08T00:00:00.000Z",
    source_context: { kind: "boardroom" }
  });

  assert.equal(out.status, "qualified");
  assert.equal(out.claims.length, 1);
  assert.equal(out.claims[0]!.predicate, "partnered_with");
  assert.equal(out.claims[0]!.subject?.canonical_name, "A24");
  assert.equal(out.claims[0]!.object.kind, "entity");
  if (out.claims[0]!.object.kind === "entity") {
    assert.equal(out.claims[0]!.object.entity.canonical_name, "Google DeepMind");
  }
  assert.equal(out.sports_milestones.length, 0);
});

test("Boardroom downstream: non-partnership excerpt yields not_qualified and 0 claims", () => {
  const out = qualifyEvidenceReferenceDownstreamV1({
    evidence: mkBoardroomEvidence({
      id: "ev_e911fbbfacd756c0cb7b0197",
      url: "https://boardroom.tv/apple-doesnt-need-to-win-ai-race/",
      title: "Why Apple Doesn't Need to Win the AI Race",
      excerpt: "<p>After this year's WWDC, Apple's stock price took a tumble.</p>"
    }),
    now_iso: "2026-08-08T00:00:00.000Z",
    source_context: { kind: "boardroom" }
  });

  assert.equal(out.status, "not_qualified");
  assert.equal(out.claims.length, 0);
  assert.equal(out.sports_milestones.length, 0);
});


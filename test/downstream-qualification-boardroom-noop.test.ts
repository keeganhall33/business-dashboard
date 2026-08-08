import { describe, expect, it } from "vitest";

import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";
import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";

function mkBoardroomEvidence(input: { id: string; url: string; title: string }): EvidenceReference {
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
    evidence_type: "news_article",
    access_classification: "public",
    legal_policy_version: "boardroom.rss.link_only.v1",
    retention_policy: "link_only",
    excerpt_or_summary_reference: null,
    source_credibility_prior: "medium",
    correction_status: "none",
    retraction_status: "none",
    supersedes_evidence_reference_id: null,
    provenance_metadata: {
      feed_url: "https://boardroom.tv/feed/",
      canonical_url: input.url,
      guid: "https://boardroom.tv/?p=1",
      source_item_id: "guid:https://boardroom.tv/?p=1",
      rss_position: 0,
      title: input.title,
      published_at: "2026-08-08T00:00:00.000Z",
      collected_at: "2026-08-08T00:00:00.000Z",
      author: "x",
      categories: ["Sports"],
      excerpt: "x",
      rss_content_present: true
    },
    credibility: { level: "medium", bounded_score: null, reasons: [] },
    corroborating_evidence_reference_ids: [],
    contradicting_evidence_reference_ids: []
  };
}

describe("downstream qualification: Boardroom generalized claims v1", () => {
  const cases = [
    { label: "BR-1", id: "ev_2623049899a3bd37abf05087", url: "https://boardroom.tv/a24-ai-google-deepmind-movies-films/", title: "A24 Built Its Brand on Artists; Now It's Betting on AI" },
    { label: "BR-2", id: "ev_e911fbbfacd756c0cb7b0197", url: "https://boardroom.tv/apple-doesnt-need-to-win-ai-race/", title: "Why Apple Doesn't Need to Win the AI Race" },
    { label: "BR-3", id: "ev_db0124b7f977e28f283293d1", url: "https://boardroom.tv/ashley-graham-interview-magazine/", title: "The Many Lives of Ashley Graham" },
    { label: "BR-4", id: "ev_2333a0df8ca746759b64d37b", url: "https://boardroom.tv/can-steven-spielbergs-disclosure-day-break-through-in-2026/", title: "Can ‘Disclosure Day’ Break Through in 2026?" },
    { label: "BR-5", id: "ev_681e80b4cc2b7e359df16c2a", url: "https://boardroom.tv/chris-evert-martina-navratilova-final-set-netflix-boardroom-talks/", title: "Chris Evert and Martina Navratilova…" }
  ];

  for (const c of cases) {
    it(`${c.label}: BR-1 qualifies, others not_qualified`, () => {
      const out = qualifyEvidenceReferenceDownstreamV1({
        evidence: mkBoardroomEvidence({ id: c.id, url: c.url, title: c.title }),
        now_iso: "2026-08-08T00:00:00.000Z",
        source_context: { kind: "boardroom" }
      });

      if (c.label === "BR-1") {
        expect(out.status).toBe("qualified");
        expect(out.claims.length).toBe(1);
        expect(out.claims[0]?.predicate).toBe("partnered_with");
      } else {
        expect(out.status).toBe("not_qualified");
        expect(out.claims.length).toBe(0);
      }
      expect(out.sports_milestones.length).toBe(0);
    });
  }
});

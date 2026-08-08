import { describe, expect, it } from "vitest";

import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";
import {
  buildHoophallClaim,
  buildHoophallMilestone,
  qualifyHoophallItemToMilestone
} from "@/lib/external-intelligence/collection/hoophall/hoophall.qualification";
import { qualifyEvidenceReferenceDownstreamV1 } from "@/lib/external-intelligence/qualification/downstream-qualification-v1";

describe("downstream qualification: Hoophall parity", () => {
  it("produces equivalent Claim + SportsMilestone for a qualifying input", () => {
    const headline = "2026 Enshrinement Ceremony scheduled";
    const listing_description = "The Enshrinement will take place on August 10, 2026 at Springfield.";
    const detail_excerpt = null;

    const qual = qualifyHoophallItemToMilestone({ headline, listing_description, detail_excerpt });
    expect(qual.ok).toBe(true);
    if (!qual.ok) return;

    const evidence_reference_id = "ev_test_hoophall_000000000000000000";
    const ev: EvidenceReference = {
      schema_version: "evidence_reference_v1",
      evidence_reference_id,
      source_id: "sports.basketball.hoophall.official",
      source_config_version: "v1",
      source_set_id: null,
      source_artifact_identifier: null,
      source_url_or_reference: "https://www.hoophall.com/news/x",
      content_hash: "0".repeat(64),
      retrieved_at: "2026-08-08T00:00:00.000Z",
      published_at: null,
      event_time: null,
      evidence_type: "official_announcement",
      access_classification: "public",
      legal_policy_version: "b6.hoophall.link_only.v1",
      retention_policy: "link_only",
      excerpt_or_summary_reference: null,
      source_credibility_prior: "high",
      correction_status: "none",
      retraction_status: "none",
      supersedes_evidence_reference_id: null,
      provenance_metadata: { headline, collected_at: "2026-08-08T00:00:00.000Z", published_at: null },
      credibility: { level: "high", bounded_score: null, reasons: ["official_newsroom"] },
      corroborating_evidence_reference_ids: [],
      contradicting_evidence_reference_ids: []
    };

    const expectedClaim = buildHoophallClaim({
      evidence_reference_id,
      predicate: "milestone_scheduled_for",
      subject: null,
      object_date_ymd: qual.milestone_date_ymd,
      retrieved_at_iso: "2026-08-08T00:00:00.000Z",
      announcement_time_iso: null
    });
    const expectedMilestone = buildHoophallMilestone({
      category: qual.category,
      milestone_date_ymd: qual.milestone_date_ymd,
      evidence_url: ev.source_url_or_reference,
      evidence_label: headline
    });

    const out = qualifyEvidenceReferenceDownstreamV1({
      evidence: ev,
      now_iso: "2026-08-08T00:00:00.000Z",
      source_context: { kind: "hoophall", headline, listing_description, detail_excerpt }
    });

    expect(out.status).toBe("qualified");
    expect(out.claims.length).toBe(1);
    expect(out.sports_milestones.length).toBe(1);

    const claim = out.claims[0]!;
    const milestone = out.sports_milestones[0]!;

    expect(claim.claim_id).toBe(expectedClaim.claim_id);
    expect(claim.predicate).toBe(expectedClaim.predicate);
    expect(claim.object).toEqual(expectedClaim.object);

    expect(milestone.milestone_id).toBe(expectedMilestone.milestone_id);
    expect(milestone.milestone_date).toBe(expectedMilestone.milestone_date);
    expect(milestone.championship_or_achievement_type).toBe(expectedMilestone.championship_or_achievement_type);
  });
});


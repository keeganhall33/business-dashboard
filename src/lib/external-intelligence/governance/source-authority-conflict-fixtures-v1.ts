import type { SourceAuthorityConflictInputV1 } from "@/lib/external-intelligence/governance/source-authority-conflict-v1";

export const SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1 = {
  authoritativeVsStale: {
    subject: "museum.show.example",
    predicate: "opening_date",
    as_of: "2026-08-25T12:00:00.000Z",
    claims: [
      {
        evidence_reference_id: "ev_primary_stale_opening",
        source_id: "museum_official_archive",
        claim_value: "2026-07-01",
        authority_level: "primary",
        directness: "direct",
        retrieved_at: "2026-04-01T12:00:00.000Z",
        published_at: "2026-03-15T12:00:00.000Z",
        corroborating_evidence_reference_ids: [],
        contradicting_evidence_reference_ids: ["ev_primary_current_opening"],
        support_state: "SUPPORTED",
        note: "Older official page retained for audit."
      },
      {
        evidence_reference_id: "ev_primary_current_opening",
        source_id: "museum_official_current",
        claim_value: "2026-09-12",
        authority_level: "primary",
        directness: "direct",
        retrieved_at: "2026-08-24T12:00:00.000Z",
        published_at: "2026-08-20T12:00:00.000Z",
        corroborating_evidence_reference_ids: ["ev_secondary_current_opening"],
        contradicting_evidence_reference_ids: ["ev_primary_stale_opening"],
        support_state: "SUPPORTED",
        note: "Current official page should drive review."
      },
      {
        evidence_reference_id: "ev_secondary_current_opening",
        source_id: "local_press_calendar",
        claim_value: "2026-09-12",
        authority_level: "secondary",
        directness: "reported",
        retrieved_at: "2026-08-23T12:00:00.000Z",
        published_at: "2026-08-22T12:00:00.000Z",
        corroborating_evidence_reference_ids: ["ev_primary_current_opening"],
        contradicting_evidence_reference_ids: [],
        support_state: "SUPPORTED",
        note: "Secondary corroboration only."
      }
    ]
  },
  twoCredibleConflictingSources: {
    subject: "brand.collaboration.example",
    predicate: "confirmed_partner",
    as_of: "2026-08-25T12:00:00.000Z",
    claims: [
      {
        evidence_reference_id: "ev_league_release_partner",
        source_id: "league_official_release",
        claim_value: "Partner A",
        authority_level: "primary",
        directness: "direct",
        retrieved_at: "2026-08-24T12:00:00.000Z",
        published_at: "2026-08-24T09:00:00.000Z",
        corroborating_evidence_reference_ids: [],
        contradicting_evidence_reference_ids: ["ev_brand_release_partner"],
        support_state: "SUPPORTED",
        note: "League page names Partner A."
      },
      {
        evidence_reference_id: "ev_brand_release_partner",
        source_id: "brand_official_release",
        claim_value: "Partner B",
        authority_level: "primary",
        directness: "direct",
        retrieved_at: "2026-08-24T13:00:00.000Z",
        published_at: "2026-08-24T10:00:00.000Z",
        corroborating_evidence_reference_ids: [],
        contradicting_evidence_reference_ids: ["ev_league_release_partner"],
        support_state: "SUPPORTED",
        note: "Brand page names Partner B."
      }
    ]
  },
  unsupportedClaims: {
    subject: "artist.market.example",
    predicate: "buyer_intent",
    as_of: "2026-08-25T12:00:00.000Z",
    claims: [
      {
        evidence_reference_id: "ev_forum_guess_buyer_intent",
        source_id: "community_forum",
        claim_value: "high",
        authority_level: "community",
        directness: "inferred",
        retrieved_at: "2026-08-24T12:00:00.000Z",
        published_at: "2026-08-23T12:00:00.000Z",
        corroborating_evidence_reference_ids: [],
        contradicting_evidence_reference_ids: [],
        support_state: "UNSUPPORTED",
        note: "Community speculation without retained support."
      },
      {
        evidence_reference_id: "ev_empty_crm_lookup",
        source_id: "manual_crm_check",
        claim_value: null,
        authority_level: "primary",
        directness: "direct",
        retrieved_at: "2026-08-24T12:00:00.000Z",
        published_at: null,
        corroborating_evidence_reference_ids: [],
        contradicting_evidence_reference_ids: [],
        support_state: "UNKNOWN",
        note: "No affirmative buyer-intent evidence found."
      }
    ]
  }
} satisfies Record<string, SourceAuthorityConflictInputV1>;

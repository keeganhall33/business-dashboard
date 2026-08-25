import type { SourceAuthorityConflictInputV1 } from "./contracts";

export const SOURCE_AUTHORITY_CONFLICT_FIXTURES_V1: SourceAuthorityConflictInputV1[] = [
  {
    contract_version: "source_authority_conflict_input_v1",
    case_id: "authoritative-vs-stale-primary",
    claim_subject: "collector-room-cost-coverage",
    claims: [
      {
        claim_id: "claim-fresh-primary-covered",
        ref_id: "primary-host-current-cost-coverage",
        label: "Fresh host confirmation",
        source: "manual_fixture",
        directness: "DIRECT",
        truth_state: "KNOWN",
        freshness_state: "FRESH",
        evidence_quality: "HIGH",
        claim: "Host can cover room cost if the concept stays invite-only.",
        source_authority: "PRIMARY",
        corroborates_ref_ids: ["official-venue-current-availability"],
        notes: "Direct current fixture from the party responsible for cost coverage."
      },
      {
        claim_id: "claim-stale-official-not-covered",
        ref_id: "stale-venue-policy-no-cost-coverage",
        label: "Stale venue policy",
        source: "data_evidence_fixture",
        directness: "DIRECT",
        truth_state: "STALE",
        freshness_state: "STALE",
        evidence_quality: "MEDIUM",
        claim: "Host cannot cover room cost.",
        source_authority: "OFFICIAL",
        corroborates_ref_ids: [],
        notes: "Older official fixture remains visible but cannot silently override fresher primary evidence."
      }
    ]
  },
  {
    contract_version: "source_authority_conflict_input_v1",
    case_id: "two-credible-conflicting-sources",
    claim_subject: "sports-culture-partner-fit",
    claims: [
      {
        claim_id: "claim-editorial-fit",
        ref_id: "credible-editorial-fit-current",
        label: "Current editorial fit note",
        source: "manual_fixture",
        directness: "DIRECT",
        truth_state: "KNOWN",
        freshness_state: "FRESH",
        evidence_quality: "HIGH",
        claim: "Partner is actively looking for premium sports-culture stories.",
        source_authority: "CREDIBLE_SECONDARY",
        corroborates_ref_ids: ["strategy-prepare-creative-direction"],
        notes: "Credible but not primary; supports review, not certainty."
      },
      {
        claim_id: "claim-editorial-not-fit",
        ref_id: "credible-editorial-calendar-conflict",
        label: "Current editorial calendar note",
        source: "manual_fixture",
        directness: "DIRECT",
        truth_state: "KNOWN",
        freshness_state: "FRESH",
        evidence_quality: "HIGH",
        claim: "Partner is not accepting premium sports-culture stories this cycle.",
        source_authority: "CREDIBLE_SECONDARY",
        corroborates_ref_ids: ["boardroom-story-fit-old-note"],
        notes: "Equally credible conflict remains explicit until a primary source resolves it."
      }
    ]
  },
  {
    contract_version: "source_authority_conflict_input_v1",
    case_id: "unsupported-relationship-access-claim",
    claim_subject: "warm-intro-access",
    claims: [
      {
        claim_id: "claim-unsupported-warm-intro",
        ref_id: "unsupported-warm-intro-rumor",
        label: "Unsupported warm intro rumor",
        source: "manual_fixture",
        directness: "PROXY",
        truth_state: "UNKNOWN",
        freshness_state: "UNKNOWN",
        evidence_quality: "UNKNOWN",
        claim: "A warm intro exists.",
        source_authority: "UNSUPPORTED",
        corroborates_ref_ids: [],
        notes: "No private contact, source, or direct evidence is asserted."
      }
    ]
  }
];

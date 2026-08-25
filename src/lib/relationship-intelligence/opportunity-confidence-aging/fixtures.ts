import { resolveRelationshipOpportunityConfidenceAgingV1 } from "./adapter";
import type { RelationshipOpportunityConfidenceAgingInputV1 } from "./contracts";

export const RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_INPUT_FIXTURES_V1: RelationshipOpportunityConfidenceAgingInputV1[] = [
  {
    opportunity_id: "confidence-fresh-collector-circle",
    target_label: "Avery Morgan collector circle",
    opportunity_label: "Private collector-room introduction path",
    confidence: "likely",
    confidence_last_reviewed_at: "2026-08-23T12:00:00.000Z",
    timing_state: "THIS_MONTH",
    timing_last_checked_at: "2026-08-24T12:00:00.000Z",
    truth_state: "KNOWN",
    evidence_refs: [
      {
        ref_id: "collector-circle-known-bridge",
        label: "Known collector bridge",
        source: "manual_fixture",
        truth_state: "KNOWN",
        quality: "HIGH",
        notes: "Known internal relationship context for planning only.",
        observed_at: "2026-08-23T12:00:00.000Z"
      }
    ],
    review_window_days: 14,
    opportunity_importance: "HIGH",
    next_internal_action: "Refresh the private collector-room confidence packet before any outreach."
  },
  {
    opportunity_id: "confidence-aged-boardroom-story-fit",
    target_label: "Boardroom sports-culture editorial surface",
    opportunity_label: "Boardroom story-fit relationship opportunity",
    confidence: "possible",
    confidence_last_reviewed_at: "2026-08-02T12:00:00.000Z",
    timing_state: "THIS_MONTH",
    timing_last_checked_at: "2026-08-05T12:00:00.000Z",
    truth_state: "STALE",
    evidence_refs: [
      {
        ref_id: "boardroom-story-fit-old-note",
        label: "Old Boardroom story-fit note",
        source: "strategy_fixture",
        truth_state: "STALE",
        quality: "MEDIUM",
        notes: "Strategic fit may still matter, but current editorial appetite needs review.",
        observed_at: "2026-08-01T12:00:00.000Z"
      }
    ],
    review_window_days: 14,
    opportunity_importance: "HIGH",
    next_internal_action: "Review Boardroom evidence freshness and update confidence before any outreach."
  },
  {
    opportunity_id: "confidence-unknown-cultural-bridge",
    target_label: "Unknown cultural bridge",
    opportunity_label: "Unsupported cultural bridge opportunity",
    confidence: "insufficient_evidence",
    confidence_last_reviewed_at: null,
    timing_state: "UNKNOWN",
    timing_last_checked_at: null,
    truth_state: "UNKNOWN",
    evidence_refs: [
      {
        ref_id: "unknown-cultural-bridge-gap",
        label: "Unsupported bridge gap",
        source: "manual_fixture",
        truth_state: "UNKNOWN",
        quality: "UNKNOWN",
        notes: "No identity, timing, or relationship edge is supported.",
        observed_at: null
      }
    ],
    review_window_days: null,
    opportunity_importance: "UNKNOWN",
    next_internal_action: "Clarify whether any real relationship evidence exists before ranking this opportunity."
  }
];

export const RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_FIXTURES_V1 = RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_INPUT_FIXTURES_V1.map((input) =>
  resolveRelationshipOpportunityConfidenceAgingV1(input)
);

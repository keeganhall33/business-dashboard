import type { ConversationalDecisionFixtureV1 } from "./contracts";

const baseEvidence = [
  {
    id: "ev-prestige-fit",
    label: "Prestige fit",
    source: "strategy_fixture.private_collector_room",
    provenance: "SYSTEM_EVIDENCE" as const,
    truth_state: "KNOWN" as const,
    detail: "Private collector context aligns with scarcity, premium positioning, and relationship depth."
  },
  {
    id: "ev-access-path-unverified",
    label: "Access path unverified",
    source: "strategy_fixture.private_collector_room",
    provenance: "SYSTEM_EVIDENCE" as const,
    truth_state: "UNKNOWN" as const,
    detail: "No verified host, sponsor, or buyer access route is recorded in the fixture."
  },
  {
    id: "ev-direct-economics-unknown",
    label: "Direct economics unknown",
    source: "financial_fixture.not_integrated",
    provenance: "SYSTEM_EVIDENCE" as const,
    truth_state: "UNKNOWN" as const,
    detail: "The recommendation does not contain known venue, sponsor, travel, or conversion economics."
  }
];

export const CONVERSATIONAL_DECISION_FIXTURE_V1: ConversationalDecisionFixtureV1 = {
  decision_id: "decision-private-collector-room",
  strategic_question: "Does this create durable advantage or just another speculative event idea?",
  current_version: {
    recommendation_id: "rec-private-collector-room",
    version: 1,
    title: "Private collector room concept",
    recommendation_summary: "Validate access before investing in a full prestige-event concept.",
    recommended_action: "Validate one warm route into the host or sponsor ecosystem before building the full concept.",
    why: "Prestige fit is strong, but access and direct economics are still unknown.",
    approval_level: "L1_RECOMMENDATION",
    evidence_refs: baseEvidence,
    assumptions: [
      {
        id: "as-access-can-be-tested",
        label: "Access can be tested cheaply",
        state: "OPEN",
        detail: "A narrow warm-intro validation is assumed to be possible before committing to a full event build.",
        evidence_refs: ["ev-access-path-unverified"]
      }
    ],
    unknowns: ["Verified host/sponsor route", "Direct event economics"],
    conflicts: [],
    created_from_turn_id: "seed"
  },
  prior_versions: [],
  turns: [
    {
      turn_id: "turn-grounded-why",
      recommendation_id: "rec-private-collector-room",
      classification: "QUESTION_ONLY",
      user_utterance: "Why are you recommending validation instead of building the private collector room now?",
      interpreted_claim: null
    },
    {
      turn_id: "turn-hypothetical-sponsor",
      recommendation_id: "rec-private-collector-room",
      classification: "HYPOTHETICAL",
      user_utterance: "What if a sponsor covered the room fee?",
      interpreted_claim: null,
      hypothetical_overlay: {
        scenario: "A sponsor covers the room fee.",
        projected_changes: ["Cost risk falls", "Access still remains unproven", "No stored fact changes"]
      }
    },
    {
      turn_id: "turn-human-reported-fact",
      recommendation_id: "rec-private-collector-room",
      classification: "HUMAN_REPORTED_FACT",
      user_utterance: "I have a confirmed warm intro to the host through a collector.",
      interpreted_claim: "Keegan reports a confirmed warm introduction to the host through a collector."
    }
  ]
};

import type {
  RecommendationRevisionInputV1,
  RecommendationRevisionVersionV1,
  RevisionEvidenceRefV1,
  RevisionProvenanceKindV1,
  RevisionProvenanceV1
} from "./contracts";
import { reviseRecommendationVersionV1 } from "./adapter";

function provenance(input: {
  source_id: string;
  source_label: string;
  kind: RevisionProvenanceKindV1;
  actor: RevisionProvenanceV1["actor"];
  memory_write_allowed: boolean;
  notes: string;
}): RevisionProvenanceV1 {
  return {
    ...input,
    captured_at: "2026-08-20T12:00:00.000Z"
  };
}

function evidence(input: Omit<RevisionEvidenceRefV1, "provenance"> & { provenance: RevisionProvenanceV1 }): RevisionEvidenceRefV1 {
  return input;
}

const systemProvenance = provenance({
  source_id: "fixture-system-seed",
  source_label: "Decision Intelligence fixture seed",
  kind: "SYSTEM_EVIDENCE",
  actor: "JEEVES_FIXTURE",
  memory_write_allowed: true,
  notes: "Read-only deterministic fixture evidence."
});

export const RECOMMENDATION_REVISION_BASE_VERSION_V1: RecommendationRevisionVersionV1 = {
  recommendation_id: "rec-private-collector-room",
  version: 1,
  title: "Private collector room concept",
  recommendation_summary: "Validate access before investing in a full prestige-event concept.",
  recommended_action: "Validate one warm route into the host or sponsor ecosystem before building the full concept.",
  urgency: "MEDIUM",
  approval_level: "L1_RECOMMENDATION",
  confidence: "possible",
  evidence_refs: [
    evidence({
      evidence_id: "ev-prestige-fit",
      label: "Prestige fit",
      provenance: systemProvenance,
      truth_state: "KNOWN",
      detail: "Private collector context aligns with scarcity and premium positioning."
    }),
    evidence({
      evidence_id: "ev-access-route",
      label: "Access route",
      provenance: systemProvenance,
      truth_state: "UNKNOWN",
      detail: "No verified host, sponsor, or buyer access route is recorded."
    })
  ],
  assumptions: [
    {
      assumption_id: "as-access-can-be-tested",
      label: "Access can be tested cheaply",
      state: "OPEN",
      detail: "A narrow warm-intro validation is assumed to be possible.",
      evidence_refs: ["ev-access-route"]
    }
  ],
  unknowns: ["Verified host/sponsor route", "Direct event economics"],
  conflicts: [],
  created_from_input_id: "seed"
};

const hypotheticalProvenance = provenance({
  source_id: "turn-hypothetical-sponsor",
  source_label: "Ask Jeeves hypothetical transcript",
  kind: "HYPOTHETICAL",
  actor: "KEEGAN",
  memory_write_allowed: false,
  notes: "Scenario exploration only; not a fact."
});

const humanFactProvenance = provenance({
  source_id: "turn-human-confirmed-host-intro",
  source_label: "Keegan reported host introduction",
  kind: "HUMAN_REPORTED_FACT",
  actor: "KEEGAN",
  memory_write_allowed: true,
  notes: "Human-reported fact with explicit provenance."
});

const correctionProvenance = provenance({
  source_id: "turn-correction-not-decision-maker",
  source_label: "Keegan correction to host-intro assumption",
  kind: "CORRECTION",
  actor: "KEEGAN",
  memory_write_allowed: true,
  notes: "Correction lowers confidence and marks access evidence conflicted."
});

export const RECOMMENDATION_REVISION_INPUT_FIXTURES_V1: RecommendationRevisionInputV1[] = [
  {
    input_id: "input-hypothetical-no-memory-mutation",
    recommendation_id: "rec-private-collector-room",
    classification: "HYPOTHETICAL",
    utterance: "What if a sponsor covered the room fee?",
    interpreted_claim: null,
    provenance: hypotheticalProvenance,
    proposed_changes: {
      evidence_to_add: [
        evidence({
          evidence_id: "ev-hypothetical-sponsor-covered-fee",
          label: "Hypothetical sponsor fee coverage",
          provenance: hypotheticalProvenance,
          truth_state: "HYPOTHETICAL_ONLY",
          detail: "Scenario only; cannot be promoted to fact."
        })
      ]
    }
  },
  {
    input_id: "input-human-reported-fact-provenance",
    recommendation_id: "rec-private-collector-room",
    classification: "HUMAN_REPORTED_FACT",
    utterance: "I have a confirmed warm intro to the host through a collector.",
    interpreted_claim: "Keegan reports a confirmed warm introduction to the host through a collector.",
    provenance: humanFactProvenance,
    proposed_changes: {
      recommendation_summary: "Use the confirmed warm host introduction to validate access before any full event build.",
      recommended_action: "Take the warm intro, verify host/sponsor decision-maker access, and then decide whether to prepare the prestige-event concept.",
      urgency: "HIGH",
      approval_level: "L1_RECOMMENDATION",
      confidence: "likely",
      unknowns: ["Direct event economics"],
      conflicts: [],
      evidence_to_add: [
        evidence({
          evidence_id: "ev-human-confirmed-host-intro",
          label: "Confirmed host introduction",
          provenance: humanFactProvenance,
          truth_state: "KNOWN",
          detail: "Keegan reports a confirmed warm introduction to the host through a collector."
        })
      ],
      changed_assumptions: [
        {
          assumption_id: "as-access-can-be-tested",
          label: "Access can be tested cheaply",
          state: "CONFIRMED",
          detail: "Human-reported warm intro creates a concrete access validation path.",
          evidence_refs: ["ev-access-route", "ev-human-confirmed-host-intro"]
        }
      ],
      why_changed: ["Human-reported fact resolves the access-route unknown.", "Prior recommendation version is preserved for audit."]
    }
  },
  {
    input_id: "input-correction-conflicted-access",
    recommendation_id: "rec-private-collector-room",
    classification: "CORRECTION",
    utterance: "Correction: the intro is to a staff member, not the host or sponsor decision-maker.",
    interpreted_claim: "The prior host introduction should be treated as conflicted because it does not reach a decision-maker.",
    provenance: correctionProvenance,
    proposed_changes: {
      recommendation_summary: "Return to access validation; the warm intro is not yet decision-maker access.",
      recommended_action: "Do not prepare the event concept yet; qualify whether the staff route can reach the host or sponsor decision-maker.",
      urgency: "MEDIUM",
      approval_level: "L0_INSIGHT",
      confidence: "possible",
      unknowns: ["Verified host/sponsor route", "Direct event economics"],
      conflicts: ["Reported intro exists, but decision-maker access is conflicted."],
      evidence_to_add: [
        evidence({
          evidence_id: "ev-correction-staff-not-decision-maker",
          label: "Correction: staff route only",
          provenance: correctionProvenance,
          truth_state: "CONFLICTED",
          detail: "Intro is not confirmed decision-maker access."
        })
      ],
      changed_assumptions: [
        {
          assumption_id: "as-access-can-be-tested",
          label: "Access can be tested cheaply",
          state: "CONFLICTED",
          detail: "Route may exist, but decision-maker reach is not verified.",
          evidence_refs: ["ev-access-route", "ev-correction-staff-not-decision-maker"]
        }
      ],
      why_changed: ["Correction reopens the access-route unknown.", "Decision-maker access is now explicitly conflicted.", "Approval class drops because the premise weakened."]
    }
  }
];

export const RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1 = reviseRecommendationVersionV1({
  current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
  revisionInput: RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[0]!
});

export const RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1 = reviseRecommendationVersionV1({
  current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
  revisionInput: RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[1]!
});

export const RECOMMENDATION_REVISION_CORRECTION_RESULT_V1 = reviseRecommendationVersionV1({
  current: RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1.active_recommendation,
  priorVersions: RECOMMENDATION_REVISION_HUMAN_FACT_RESULT_V1.preserved_versions,
  revisionInput: RECOMMENDATION_REVISION_INPUT_FIXTURES_V1[2]!
});

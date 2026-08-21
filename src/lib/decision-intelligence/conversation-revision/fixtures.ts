import { RECOMMENDATION_REVISION_BASE_VERSION_V1 } from "@/lib/decision-intelligence/revision/fixtures";
import { previewConversationRecommendationRevisionV1 } from "./adapter";
import type { CanonicalConversationRevisionPayloadV1 } from "./contracts";

const base = {
  recommendation_id: RECOMMENDATION_REVISION_BASE_VERSION_V1.recommendation_id,
  captured_at: "2026-08-20T12:00:00.000Z",
  actor: "KEEGAN" as const
};

const confirmedHostIntroChanges: CanonicalConversationRevisionPayloadV1["proposed_changes"] = {
  recommendation_summary: "Use the confirmed warm host introduction to validate access before any full event build.",
  recommended_action: "Take the warm intro, verify host/sponsor decision-maker access, and then decide whether to prepare the prestige-event concept.",
  urgency: "HIGH",
  approval_level: "L1_RECOMMENDATION",
  confidence: "likely",
  unknowns: ["Direct event economics"],
  conflicts: [],
  evidence_to_add: [
    {
      evidence_id: "ev-human-confirmed-host-intro",
      label: "Confirmed host introduction",
      truth_state: "KNOWN",
      detail: "Keegan reports a confirmed warm introduction to the host through a collector."
    }
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
};

export const CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1: CanonicalConversationRevisionPayloadV1 = {
  ...base,
  payload_id: "payload-text-confirmed-host-intro",
  payload_kind: "TEXT",
  classification: "HUMAN_REPORTED_FACT",
  text: "I have a confirmed warm intro to the host through a collector.",
  interpreted_claim: "Keegan reports a confirmed warm introduction to the host through a collector.",
  source_label: "Ask Jeeves text input",
  proposed_changes: confirmedHostIntroChanges
};

export const CONVERSATION_REVISION_TRANSCRIPT_FACT_PAYLOAD_V1: CanonicalConversationRevisionPayloadV1 = {
  ...base,
  payload_id: "payload-transcript-confirmed-host-intro",
  payload_kind: "VOICE_TRANSCRIPT",
  classification: "HUMAN_REPORTED_FACT",
  transcript: "I have a confirmed warm intro to the host through a collector.",
  interpreted_claim: "Keegan reports a confirmed warm introduction to the host through a collector.",
  source_label: "Ask Jeeves voice transcript",
  proposed_changes: confirmedHostIntroChanges
};

export const CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1: CanonicalConversationRevisionPayloadV1[] = [
  {
    ...base,
    payload_id: "payload-question-only",
    payload_kind: "TEXT",
    classification: "QUESTION_ONLY",
    text: "What evidence would change this recommendation?",
    interpreted_claim: null,
    source_label: "Ask Jeeves question input"
  },
  {
    ...base,
    payload_id: "payload-hypothetical",
    payload_kind: "TEXT",
    classification: "HYPOTHETICAL",
    text: "What if a sponsor covered the room fee?",
    interpreted_claim: null,
    source_label: "Ask Jeeves hypothetical input",
    proposed_changes: {
      evidence_to_add: [
        {
          evidence_id: "ev-hypothetical-sponsor-covered-fee",
          label: "Hypothetical sponsor fee coverage",
          truth_state: "HYPOTHETICAL_ONLY",
          detail: "Scenario only; cannot be promoted to fact."
        }
      ],
      why_changed: ["Hypothetical scenario is preview-only and cannot mutate fact state."]
    }
  },
  CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1,
  {
    ...base,
    payload_id: "payload-human-judgment",
    payload_kind: "TEXT",
    classification: "HUMAN_JUDGMENT",
    text: "My judgment is that this only works if the route feels genuinely private.",
    interpreted_claim: "Keegan judges that privacy quality is material to the recommendation.",
    source_label: "Ask Jeeves judgment input",
    proposed_changes: {
      confidence: "likely",
      evidence_to_add: [
        {
          evidence_id: "ev-human-privacy-judgment",
          label: "Human judgment: privacy quality matters",
          truth_state: "ASSUMED",
          detail: "Keegan judges that the route must feel genuinely private to preserve positioning."
        }
      ],
      changed_assumptions: [
        {
          assumption_id: "as-private-route-quality",
          label: "Private route quality matters",
          state: "OPEN",
          detail: "Privacy quality should be checked before the concept advances.",
          evidence_refs: ["ev-human-privacy-judgment"]
        }
      ],
      why_changed: ["Human judgment adds a positioning assumption without treating it as confirmed external fact."]
    }
  },
  {
    ...base,
    payload_id: "payload-correction-conflicted",
    payload_kind: "TEXT",
    classification: "CORRECTION",
    text: "Correction: the intro is to a staff member, not the host or sponsor decision-maker.",
    interpreted_claim: "The prior host introduction should be treated as conflicted because it does not reach a decision-maker.",
    source_label: "Ask Jeeves correction input",
    proposed_changes: {
      recommendation_summary: "Return to access validation; the warm intro is not yet decision-maker access.",
      recommended_action: "Do not prepare the event concept yet; qualify whether the staff route can reach the host or sponsor decision-maker.",
      urgency: "MEDIUM",
      approval_level: "L0_INSIGHT",
      confidence: "possible",
      unknowns: ["Verified host/sponsor route", "Direct event economics"],
      conflicts: ["Reported intro exists, but decision-maker access is conflicted."],
      evidence_to_add: [
        {
          evidence_id: "ev-correction-staff-not-decision-maker",
          label: "Correction: staff route only",
          truth_state: "CONFLICTED",
          detail: "Intro is not confirmed decision-maker access."
        }
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
      why_changed: ["Correction reopens the access-route unknown.", "Decision-maker access is now explicitly conflicted.", "Old evidence is preserved rather than overwritten."]
    }
  },
  {
    ...base,
    payload_id: "payload-decision-commitment",
    payload_kind: "TEXT",
    classification: "DECISION",
    text: "Decision: I will take the warm intro, but I will not build the room concept until decision-maker access is verified.",
    interpreted_claim: "Keegan commits to a validation step and blocks full concept build until decision-maker access is verified.",
    source_label: "Ask Jeeves decision input",
    proposed_changes: {
      recommended_action: "Take the warm intro as a validation step only; block full room-concept preparation until decision-maker access is verified.",
      approval_level: "L3_READY_FOR_APPROVAL",
      confidence: "likely",
      evidence_to_add: [
        {
          evidence_id: "ev-decision-validation-only",
          label: "Decision commitment: validation only",
          truth_state: "KNOWN",
          detail: "Keegan commits to validation without approving the full event concept."
        }
      ],
      why_changed: ["Decision commitment changes the approval gate for the next action."]
    }
  }
];

export const CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1 = previewConversationRecommendationRevisionV1({
  current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
  payload: CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1
});

export const CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1 = previewConversationRecommendationRevisionV1({
  current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
  payload: CONVERSATION_REVISION_TRANSCRIPT_FACT_PAYLOAD_V1
});

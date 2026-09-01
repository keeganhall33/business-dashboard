import type { DecisionEvidenceRefV1 } from "@/lib/decision-evidence/contracts";
import { prioritizeEvidenceGapsV1 } from "./adapter";
import type { EvidenceGapCandidateV1, EvidenceGapPriorityInputV1 } from "./contracts";

function evidence(input: DecisionEvidenceRefV1): DecisionEvidenceRefV1 {
  return input;
}

const directUnknownAccess = evidence({
  ref_id: "ev-unknown-decision-maker-access",
  label: "Decision-maker access is unverified",
  source: "manual_fixture",
  directness: "DIRECT",
  truth_state: "UNKNOWN",
  freshness_state: "UNKNOWN",
  evidence_quality: "UNKNOWN",
  notes: "No direct confirmation proves a decision-maker path exists."
});

const conflictedBudgetAuthority = evidence({
  ref_id: "ev-conflicted-budget-authority",
  label: "Budget authority is conflicted",
  source: "data_evidence_fixture",
  directness: "DIRECT",
  truth_state: "CONFLICTED",
  freshness_state: "FRESH",
  evidence_quality: "CONFLICTED",
  notes: "Two current sources disagree on whether the partner can fund the room."
});

const staleSecondaryFit = evidence({
  ref_id: "ev-stale-secondary-partner-fit",
  label: "Partner fit is stale secondary evidence",
  source: "strategy_fixture",
  directness: "PROXY",
  truth_state: "STALE",
  freshness_state: "STALE",
  evidence_quality: "MEDIUM",
  notes: "Old partner fit note is not current enough to carry the decision."
});

const lowValueKnown = evidence({
  ref_id: "ev-known-low-impact-merch-detail",
  label: "Known low-impact merchandising detail",
  source: "manual_fixture",
  directness: "DIRECT",
  truth_state: "KNOWN",
  freshness_state: "FRESH",
  evidence_quality: "HIGH",
  notes: "Known detail is not material enough to change the decision."
});

function gap(input: EvidenceGapCandidateV1): EvidenceGapCandidateV1 {
  return input;
}

export const EVIDENCE_GAP_PRIORITY_INPUT_V1: EvidenceGapPriorityInputV1 = {
  contract_version: "evidence_gap_priority_input_v1",
  generated_at: "2026-08-25T09:20:00.000Z",
  gaps: [
    gap({
      gap_id: "gap-decision-maker-access",
      decision_id: "decision-private-collector-room",
      label: "Confirm actual decision-maker access before event buildout.",
      evidence_ref: directUnknownAccess,
      decision_impact: "DECISION_CHANGING",
      current_source_authority: "UNSUPPORTED",
      required_source_authority: "PRIMARY",
      reversibility: "HARD_TO_REVERSE",
      verification_cost: "LOW",
      verification_action: "Verify the access path with the named host or decision-maker directly.",
      why_it_matters: "Without direct access proof, the event concept can become speculative exposure instead of a premium relationship move."
    }),
    gap({
      gap_id: "gap-budget-authority-conflict",
      decision_id: "decision-private-collector-room",
      label: "Resolve current budget authority conflict.",
      evidence_ref: conflictedBudgetAuthority,
      decision_impact: "HIGH",
      current_source_authority: "CREDIBLE_SECONDARY",
      required_source_authority: "OFFICIAL",
      reversibility: "PARTIALLY_REVERSIBLE",
      verification_cost: "MEDIUM",
      verification_action: "Ask the official budget owner whether room cost can be covered before treating prestige upside as actionable.",
      why_it_matters: "A funding conflict can change whether the recommended move remains bounded or becomes an unfunded production burden."
    }),
    gap({
      gap_id: "gap-partner-fit-refresh",
      decision_id: "decision-sports-culture-partner-fit",
      label: "Refresh stale partner fit before outreach prioritization.",
      evidence_ref: staleSecondaryFit,
      decision_impact: "HIGH",
      current_source_authority: "CREDIBLE_SECONDARY",
      required_source_authority: "PRIMARY",
      reversibility: "REVERSIBLE",
      verification_cost: "LOW",
      verification_action: "Refresh the partner fit with a current primary or official source before ranking outreach.",
      why_it_matters: "Stale fit evidence can misdirect scarce relationship bandwidth."
    }),
    gap({
      gap_id: "gap-low-impact-merch-detail",
      decision_id: "decision-private-collector-room",
      label: "Verify low-impact merchandising detail.",
      evidence_ref: lowValueKnown,
      decision_impact: "LOW",
      current_source_authority: "PRIMARY",
      required_source_authority: "PRIMARY",
      reversibility: "REVERSIBLE",
      verification_cost: "NOT_WORTH_IT",
      verification_action: "Do not spend discovery cycles here unless it becomes decision-changing.",
      why_it_matters: "This detail is known and low impact; more verification would not materially change the decision."
    })
  ]
};

export const EVIDENCE_GAP_PRIORITY_RESULT_V1 = prioritizeEvidenceGapsV1(EVIDENCE_GAP_PRIORITY_INPUT_V1);

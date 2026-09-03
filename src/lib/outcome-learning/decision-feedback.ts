/**
 * outcome-learning/decision-feedback.ts
 */

export type DecisionDisposition = "ACCEPTED" | "REJECTED" | "DEFERRED" | "UNKNOWN"
export type DecisionFeedbackReason =
  | "PREFERENCE"
  | "FEASIBILITY"
  | "TIMING"
  | "EVIDENCE_DISAGREEMENT"
  | "OTHER"
  | "UNKNOWN"

export function normalizeDecisionFeedback(input: {
  disposition?: unknown
  reason?: unknown
}): {
  disposition: DecisionDisposition
  reason: DecisionFeedbackReason
  valid: boolean
} {
  const d = input.disposition
  const r = input.reason

  let disp: DecisionDisposition = "UNKNOWN"
  let reason: DecisionFeedbackReason = "UNKNOWN"

  if (typeof d === "string") {
    const trimmed = d.trim().toUpperCase()
    if (trimmed === "ACCEPTED") disp = "ACCEPTED"
    else if (trimmed === "REJECTED") disp = "REJECTED"
    else if (trimmed === "DEFERRED") disp = "DEFERRED"
    else if (trimmed === "UNKNOWN") disp = "UNKNOWN"
  }

  if (typeof r === "string") {
    const trimmed = r.trim().toUpperCase()
    if (trimmed === "PREFERENCE") reason = "PREFERENCE"
    else if (trimmed === "FEASIBILITY") reason = "FEASIBILITY"
    else if (trimmed === "TIMING") reason = "TIMING"
    else if (trimmed === "EVIDENCE_DISAGREEMENT") reason = "EVIDENCE_DISAGREEMENT"
    else if (trimmed === "OTHER") reason = "OTHER"
  }

  const valid = disp !== "UNKNOWN" && reason !== "UNKNOWN"
  return { disposition: disp, reason, valid }
}

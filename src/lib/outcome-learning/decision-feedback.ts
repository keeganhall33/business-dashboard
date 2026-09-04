export type DecisionDisposition = "ACCEPTED" | "REJECTED" | "DEFERRED" | "UNKNOWN"
export type DecisionFeedbackReason =
  | "PREFERENCE"
  | "FEASIBILITY"
  | "TIMING"
  | "EVIDENCE_DISAGREEMENT"
  | "OTHER"
  | "UNKNOWN"

const KNOWN_DISPOSITIONS: Record<string, DecisionDisposition> = {
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  DEFERRED: "DEFERRED",
}

const KNOWN_REASONS: Record<string, DecisionFeedbackReason> = {
  PREFERENCE: "PREFERENCE",
  FEASIBILITY: "FEASIBILITY",
  TIMING: "TIMING",
  EVIDENCE_DISAGREEMENT: "EVIDENCE_DISAGREEMENT",
  OTHER: "OTHER",
}

export function normalizeDecisionFeedback(input: {
  disposition: unknown
  reason: unknown
}): {
  disposition: DecisionDisposition
  reason: DecisionFeedbackReason
  valid: boolean
} {
  const normalize = (value: unknown): string =>
    typeof value === "string" ? value.trim().toUpperCase() : ""

  const disposition = KNOWN_DISPOSITIONS[normalize(input.disposition)] || "UNKNOWN"
  const reason = KNOWN_REASONS[normalize(input.reason)] || "UNKNOWN"

  if (disposition === "UNKNOWN") {
    return { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false }
  }

  return { disposition, reason, valid: reason !== "UNKNOWN" }
}

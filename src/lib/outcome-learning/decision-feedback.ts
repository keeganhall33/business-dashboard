/** Normalize caller-supplied decision feedback into bounded reason codes. */

export function normalizeDecisionFeedback(input: { disposition?: unknown; reason?: unknown }): {
  disposition: "ACCEPTED" | "REJECTED" | "DEFERRED" | "UNKNOWN"
  reason: "PREFERENCE" | "FEASIBILITY" | "TIMING" | "EVIDENCE_DISAGREEMENT" | "OTHER" | "UNKNOWN"
  valid: boolean
} {
  const VALID = ["ACCEPTED", "REJECTED", "DEFERRED"] as const
  const RECOGNIZED = ["PREFERENCE", "FEASIBILITY", "TIMING", "EVIDENCE DISAGREEMENT", "OTHER"] as const
  const normalize = (val: unknown) => typeof val === "string" ? val.trim().toUpperCase() : ""
  let d = normalize(input.disposition), r = normalize(input.reason)
  if (!VALID.includes(d)) { d = "UNKNOWN"; return { disposition: d, reason: "UNKNOWN", valid: false } }
  if (!RECOGNIZED.includes(r)) r = "UNKNOWN"
  return { disposition: d, reason: r, valid: d !== "UNKNOWN" && r !== "UNKNOWN" }
}

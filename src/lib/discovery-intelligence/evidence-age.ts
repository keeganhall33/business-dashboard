/** Evidence age states for discovery intelligence classification. */
export type EvidenceAgeState = "FRESH" | "STALE" | "FUTURE" | "UNAVAILABLE"

/**
 * Classifies discovery evidence timing based on asOfMs vs observedAtMs.
 * Returns state and age in milliseconds, or UNAVAILABLE with null age.
 */
export function classifyEvidenceAge(input: {
  asOfMs: unknown
  observedAtMs: unknown
  staleAfterMs: unknown
}): {
  state: EvidenceAgeState
  ageMs: number | null
} {
  /** Validates finite nonnegative integer. Fractional numbers rejected. */
  const validate = (value: unknown): number | null => {
    if (typeof value !== "number" && typeof value !== "bigint") return null
    if (Number.isNaN(value)) return null
    if (!Number.isFinite(value)) return null
    const num = Number(value)
    if (num < 0 || Math.floor(num) !== num) return null
    return num
  }

  const asOfMs = validate(input.asOfMs)
  const observedAtMs = validate(input.observedAtMs)
  const staleAfterMs = validate(input.staleAfterMs)

  if (asOfMs === null || observedAtMs === null) return { state: "UNAVAILABLE", ageMs: null }

  /** staleAfterMs must be > 0 and also an integer */
  if (staleAfterMs === null || staleAfterMs <= 0) return { state: "UNAVAILABLE", ageMs: null }

  // Future observation is invalid
  if (observedAtMs > asOfMs) return { state: "FUTURE", ageMs: null }

  const ageMs = asOfMs - observedAtMs

  return {
    state: ageMs <= staleAfterMs ? "FRESH" : "STALE",
    ageMs,
  }
}

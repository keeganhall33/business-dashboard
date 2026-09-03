// Pure evidence-age classifier with exact validation contract from #1159
export type EvidenceAgeState = "FRESH" | "STALE" | "FUTURE" | "UNAVAILABLE"

export function classifyEvidenceAge(input: {
  asOfMs: unknown
  observedAtMs: unknown
  staleAfterMs: unknown
}): {
  state: EvidenceAgeState
  ageMs: number | null
} {
  // Validate all inputs per spec
  const asOfMs = validateTimestamp(input.asOfMs)
  const observedAtMs = validateTimestamp(input.observedAtMs)
  const staleAfterMs = input.staleAfterMs

  // staleAfterMs must be > 0
  if (typeof staleAfterMs !== "number" || !Number.isFinite(staleAfterMs) || !Number.isInteger(staleAfterMs) || staleAfterMs <= 0) {
    return { state: "UNAVAILABLE", ageMs: null }
  }

  // Any invalid timestamp returns UNAVAILABLE
  if (asOfMs === null || observedAtMs === null) {
    return { state: "UNAVAILABLE", ageMs: null }
  }

  // Future observation (observedAtMs > asOfMs) never clamps
  if (observedAtMs > asOfMs) {
    return { state: "FUTURE", ageMs: null }
  }

  const ageMs = asOfMs - observedAtMs
  return {
    state: ageMs <= staleAfterMs ? "FRESH" : "STALE",
    ageMs
  }
}

function validateTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

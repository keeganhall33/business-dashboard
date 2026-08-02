import type { ExpectedImpactRange } from "./recommendation-contract";
import type { ExplanationConfidence } from "./explanation-contract";

export function conservativeRevenueRange(input: {
  baselineRevenueCents: number | null;
  confidence: ExplanationConfidence;
  heuristicLiftPct: number; // e.g. 5 => 5%
  horizon: ExpectedImpactRange["horizon"];
  notes: string[];
  assumptions: string[];
}): ExpectedImpactRange {
  const baseline = input.baselineRevenueCents;
  const pct = input.heuristicLiftPct / 100;
  const currency: ExpectedImpactRange["currency"] = baseline != null ? "USD" : "UNKNOWN";

  const scale =
    input.confidence === "strongly_supported"
      ? 1
      : input.confidence === "likely"
        ? 0.75
        : input.confidence === "possible"
          ? 0.4
          : 0.2;

  const expected = baseline != null ? Math.round(baseline * pct * scale) : null;

  return {
    currency,
    horizon: input.horizon,
    low_incremental_revenue_cents: expected != null ? Math.round(expected * 0.5) : null,
    expected_incremental_revenue_cents: expected,
    high_incremental_revenue_cents: expected != null ? Math.round(expected * 1.5) : null,
    notes: input.notes,
    assumptions: input.assumptions
  };
}

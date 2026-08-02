import type { PriorityBreakdown } from "./recommendation-contract";

export function scorePriority(input: {
  revenuePotential: number;
  confidence: number;
  urgency: number;
  timeToImpact: number;
  effortInverse: number;
  costInverse: number;
  riskInverse: number;
  strategicFit: number;
  executionReadiness: number;
}): PriorityBreakdown {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const v = {
    revenuePotential: clamp01(input.revenuePotential),
    confidence: clamp01(input.confidence),
    urgency: clamp01(input.urgency),
    timeToImpact: clamp01(input.timeToImpact),
    effortInverse: clamp01(input.effortInverse),
    costInverse: clamp01(input.costInverse),
    riskInverse: clamp01(input.riskInverse),
    strategicFit: clamp01(input.strategicFit),
    executionReadiness: clamp01(input.executionReadiness)
  };

  // Transparent 0–100 scoring.
  // Emphasize revenuePotential + confidence, then urgency/timeToImpact.
  // Penalize low readiness and high risk/effort/cost through inverse factors.
  const formula =
    "overallScore = 100 * (0.25*revenuePotential + 0.20*confidence + 0.12*urgency + 0.10*timeToImpact + 0.10*executionReadiness + 0.08*strategicFit + 0.05*effortInverse + 0.05*costInverse + 0.05*riskInverse)";

  const overallScore =
    100 *
    (0.25 * v.revenuePotential +
      0.2 * v.confidence +
      0.12 * v.urgency +
      0.1 * v.timeToImpact +
      0.1 * v.executionReadiness +
      0.08 * v.strategicFit +
      0.05 * v.effortInverse +
      0.05 * v.costInverse +
      0.05 * v.riskInverse);

  return {
    ...v,
    overallScore: Math.round(overallScore * 10) / 10,
    formula
  };
}

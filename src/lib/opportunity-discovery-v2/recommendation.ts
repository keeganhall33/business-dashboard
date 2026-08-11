import type { DecisionRecommendation, OpportunityPipelineRow, ScoredFactor } from "./types";

function getFactor(factors: ScoredFactor[], id: ScoredFactor["id"]) {
  return factors.find((f) => f.id === id) ?? null;
}

export function recommendAction(params: {
  overallScore: number;
  factors: ScoredFactor[];
  pipeline: OpportunityPipelineRow | null;
}): { recommendation: DecisionRecommendation; notes: string[] } {
  const notes: string[] = [];

  const status = (params.pipeline?.status ?? "").toString();
  if (["won", "lost"].includes(status)) {
    return { recommendation: "DROP", notes: [`Pipeline status=${status} treated as terminal.`] };
  }
  if (status === "parked") {
    return { recommendation: "HOLD_AND_MONITOR", notes: ["Pipeline status=parked." ] };
  }

  const evidence = getFactor(params.factors, "EVIDENCE_STRENGTH");
  const access = getFactor(params.factors, "ACCESS");
  const commercial = getFactor(params.factors, "COMMERCIAL_SCALE");
  const intent = getFactor(params.factors, "BUYER_INTENT_SIGNAL");

  const evidenceScore = evidence?.known ? (evidence.value ?? 0) : 0;
  const accessKnown = Boolean(access?.known);
  const intentKnown = Boolean(intent?.known);
  const commercialKnown = Boolean(commercial?.known);

  // Conservative gates: don't "advance" without basic evidence + access clarity.
  if (params.overallScore >= 78 && evidenceScore >= 45 && (accessKnown || intentKnown)) {
    notes.push("High score with sufficient evidence; advance now.");
    return { recommendation: "ADVANCE_NOW", notes };
  }

  // Drop: low score plus no evidence or explicit low value.
  const valueEstimate = params.pipeline?.value_estimate;
  if (params.overallScore < 35 && evidenceScore < 35) {
    notes.push("Low score + weak evidence.");
    return { recommendation: "DROP", notes };
  }
  if (commercialKnown && typeof valueEstimate === "number" && valueEstimate > 0 && valueEstimate < 10000) {
    notes.push("Value estimate suggests sub-$10k project; likely not worth time given premium posture.");
    return { recommendation: "DROP", notes };
  }

  // Hold: decent opportunity but missing key trigger (timing/access) and not urgent.
  const timing = getFactor(params.factors, "TIMING");
  const timingKnown = Boolean(timing?.known);
  const timingScore = timingKnown ? (timing?.value ?? 0) : 0;

  if (params.overallScore >= 55 && !timingKnown && !accessKnown) {
    notes.push("Potential exists but both timing and access are unknown; hold until a trigger appears.");
    return { recommendation: "HOLD_AND_MONITOR", notes };
  }
  if (params.overallScore >= 55 && timingKnown && timingScore < 45 && !accessKnown) {
    notes.push("Not time-sensitive and access unknown; hold.");
    return { recommendation: "HOLD_AND_MONITOR", notes };
  }

  // Default: research.
  if (!commercialKnown || !intentKnown || !accessKnown) {
    notes.push("Missing critical signals; research next question(s)." );
  }
  return { recommendation: "RESEARCH", notes };
}


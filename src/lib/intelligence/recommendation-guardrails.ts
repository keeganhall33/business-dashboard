import type { RecommendationCategory } from "./recommendation-contract";
import type { ExplanationConfidence } from "./explanation-contract";

export type GuardrailContext = {
  dataMode?: "LIVE_DATA" | "PARTIAL_LIVE_DATA" | "SEED_DATA" | "UNAVAILABLE";
  missingSources: string[];
  sampleSize: { orders: number | null; sessions: number | null };
  outlierFlag: boolean;
};

export type GuardrailDecision = {
  allow: boolean;
  reasons: string[];
};

export function guardrailForCategory(input: {
  category: RecommendationCategory;
  confidence: ExplanationConfidence;
  ctx: GuardrailContext;
}): GuardrailDecision {
  const reasons: string[] = [];

  if (input.ctx.dataMode === "SEED_DATA" || input.ctx.dataMode === "UNAVAILABLE") {
    reasons.push("Seed/unavailable data mode: suppress execution-oriented recommendations.");
  }

  if (input.category === "email" && input.ctx.missingSources.includes("email")) {
    reasons.push("Email platform not connected; may prepare draft but must not recommend sending.");
  }

  if (input.category === "scale" && input.ctx.missingSources.includes("matchback")) {
    reasons.push("No matchback attribution; do not recommend scaling spend based on platform signals alone.");
  }

  const orders = input.ctx.sampleSize.orders ?? 0;
  if (orders < 3 && ["scale", "pause", "retarget"].includes(input.category)) {
    reasons.push("Small order counts: avoid aggressive recommendations.");
  }

  if (input.ctx.outlierFlag) {
    reasons.push("Outlier detected: do not treat spike as repeatable baseline growth.");
  }

  const lowConfidence = input.confidence === "insufficient_evidence";
  if (lowConfidence && input.category !== "data_connection" && input.category !== "measurement" && input.category !== "do_nothing") {
    reasons.push("Insufficient evidence: recommend waiting/measurement/data connection.");
  }

  return {
    allow: reasons.length === 0,
    reasons
  };
}


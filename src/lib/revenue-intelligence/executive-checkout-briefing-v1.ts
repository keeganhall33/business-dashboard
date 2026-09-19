import type {
  CheckoutDiagnosticsViewModelV1,
  CheckoutRecommendationV1,
  EvidenceTruthState,
} from "../checkout-diagnostics/view-model-v1";

export type RevenueExecutiveBriefingStateV1 = "BLOCKED" | "INVESTIGATE" | "MONITOR";

export interface RevenueExecutiveBriefingV1 {
  state: RevenueExecutiveBriefingStateV1;
  headline: string;
  currentRange: { startDate: string; endDate: string };
  priorRange: { startDate: string; endDate: string };
  sourceTruth: Record<"META" | "GA4" | "FUNNELKIT" | "WOO", EvidenceTruthState>;
  decisionGrade: boolean;
  evidenceNotes: string[];
  observedFriction: string | null;
  recommendation: CheckoutRecommendationV1 | null;
  measuredOutcomeStatus: "NOT_ESTABLISHED";
  attributionBoundary: string;
  requiresApproval: true;
  externalMutationAllowed: false;
}

const ATTRIBUTION_BOUNDARY =
  "This briefing summarizes observed checkout evidence only. It does not establish channel attribution, causality, expected conversion lift, revenue impact, confidence, or monetary value.";

function evidenceNotes(model: CheckoutDiagnosticsViewModelV1): string[] {
  const notes = model.integrityIssues.map((issue) => issue.message);
  for (const [source, truth] of Object.entries(model.sourceTruth)) {
    if (truth !== "COMPLETE") notes.push(`${source} evidence is ${truth.toLowerCase()}.`);
  }
  if (!model.asOf) notes.push("Checkout evidence has no valid as-of timestamp.");
  if (!model.completeThrough) notes.push("Checkout evidence has no complete-through date.");
  return [...new Set(notes)];
}

function observedFriction(model: CheckoutDiagnosticsViewModelV1): string | null {
  if (!model.decisionGrade || model.state !== "READY") return null;
  if (model.shippingLatency?.materialAlert) {
    return "Observed shipping-method latency met the existing materiality threshold.";
  }
  if (model.errors && model.errors.total_errors >= 2) {
    return `${model.errors.total_errors} checkout errors were observed in the selected range.`;
  }
  if (model.largestDropoff && model.largestDropoff.dropoffRate >= 0.3) {
    return `Largest adjacent-stage drop-off: ${model.largestDropoff.fromLabel} → ${model.largestDropoff.toLabel} (${(model.largestDropoff.dropoffRate * 100).toFixed(1)}%).`;
  }
  return null;
}

export function buildRevenueExecutiveBriefingV1(
  model: CheckoutDiagnosticsViewModelV1,
): RevenueExecutiveBriefingV1 {
  const notes = evidenceNotes(model);
  const friction = observedFriction(model);
  const ready = model.decisionGrade && model.state === "READY";
  const recommendation = ready ? model.recommendation : model.recommendation?.kind === "DATA_QUALITY" ? model.recommendation : null;

  if (!ready) {
    return {
      state: "BLOCKED",
      headline: "Revenue diagnosis is not decision-grade yet.",
      currentRange: model.currentRange,
      priorRange: model.priorRange,
      sourceTruth: model.sourceTruth,
      decisionGrade: false,
      evidenceNotes: notes.length > 0 ? notes : [model.stateLabel],
      observedFriction: null,
      recommendation,
      measuredOutcomeStatus: "NOT_ESTABLISHED",
      attributionBoundary: ATTRIBUTION_BOUNDARY,
      requiresApproval: true,
      externalMutationAllowed: false,
    };
  }

  return {
    state: recommendation ? "INVESTIGATE" : "MONITOR",
    headline: recommendation
      ? "Decision-grade checkout evidence supports a bounded investigation."
      : "Decision-grade checkout evidence is available; no material investigation threshold is currently met.",
    currentRange: model.currentRange,
    priorRange: model.priorRange,
    sourceTruth: model.sourceTruth,
    decisionGrade: true,
    evidenceNotes: notes,
    observedFriction: friction,
    recommendation,
    measuredOutcomeStatus: "NOT_ESTABLISHED",
    attributionBoundary: ATTRIBUTION_BOUNDARY,
    requiresApproval: true,
    externalMutationAllowed: false,
  };
}

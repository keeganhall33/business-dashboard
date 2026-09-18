import {
  buildRevenueDecisionPacketV1,
  type RevenueDecisionPacketInputV1,
  type RevenueDecisionPacketV1,
} from "./decision-packet-v1";
import {
  revalidateRevenueSourceFreshnessV1,
  type RevenueSourceFreshnessPolicyV1,
  type RevenueSourceFreshnessRevalidationV1,
} from "./source-freshness-revalidation-v1";

export const FRESH_REVENUE_DECISION_VERSION = "FRESH_REVENUE_DECISION_V1" as const;

export type FreshRevenueDecisionStatusV1 = "READY" | "NOT_READY" | "CONFLICTED";

export type FreshRevenueDecisionReasonV1 =
  | "FRESH_REVENUE_DECISION_READY"
  | "SOURCE_FRESHNESS_NOT_READY"
  | "SOURCE_FRESHNESS_CONFLICTED"
  | "REVENUE_DECISION_NOT_READY";

export type FreshRevenueDecisionInputV1 = {
  revenueInput: RevenueDecisionPacketInputV1;
  evaluatedAt: string;
  freshnessPolicy: RevenueSourceFreshnessPolicyV1;
};

export type FreshRevenueDecisionV1 = {
  version: typeof FRESH_REVENUE_DECISION_VERSION;
  status: FreshRevenueDecisionStatusV1;
  reasonCode: FreshRevenueDecisionReasonV1;
  evaluatedAt: string;
  sourceFreshness: RevenueSourceFreshnessRevalidationV1;
  decisionStatus: RevenueDecisionPacketV1["status"] | null;
  decisionReasonCode: string | null;
  acceptedDecision: RevenueDecisionPacketV1 | null;
  limitations: readonly string[];
  causalClaim: false;
  revenueAttributionClaim: false;
  expectedLift: null;
  confidence: null;
  monetaryValue: null;
  externalMutationAllowed: false;
  metaWriteAllowed: false;
  approvalBypassAllowed: false;
};

function finalize(
  input: FreshRevenueDecisionInputV1,
  sourceFreshness: RevenueSourceFreshnessRevalidationV1,
  status: FreshRevenueDecisionStatusV1,
  reasonCode: FreshRevenueDecisionReasonV1,
  decision: RevenueDecisionPacketV1 | null,
  acceptedDecision: RevenueDecisionPacketV1 | null,
  limitations: readonly string[],
): FreshRevenueDecisionV1 {
  return Object.freeze({
    version: FRESH_REVENUE_DECISION_VERSION,
    status,
    reasonCode,
    evaluatedAt: input.evaluatedAt,
    sourceFreshness,
    decisionStatus: decision?.status ?? null,
    decisionReasonCode: decision?.reasonCode ?? null,
    acceptedDecision,
    limitations: Object.freeze([...limitations]),
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    confidence: null,
    monetaryValue: null,
    externalMutationAllowed: false,
    metaWriteAllowed: false,
    approvalBypassAllowed: false,
  });
}

/**
 * Canonical entry point for a revenue decision that must still be fresh when it
 * is evaluated. Upstream CURRENT source labels are revalidated first under an
 * explicit per-source caller policy. Only the accepted, decision-time snapshot
 * may then enter the canonical Woo + GA4 + Meta decision builder.
 *
 * This boundary prevents a caller from accidentally treating an old CURRENT
 * observation as present-tense decision evidence merely by invoking the lower
 * level decision builder directly. It does not upgrade partial/conflicted
 * truth, establish causality or attribution, invent confidence/value, or grant
 * authority to mutate spend, pricing, checkout, WooCommerce, GA4, or Meta.
 */
export function buildFreshRevenueDecisionV1(
  input: FreshRevenueDecisionInputV1,
): FreshRevenueDecisionV1 {
  const sourceFreshness = revalidateRevenueSourceFreshnessV1(
    input.revenueInput,
    input.evaluatedAt,
    input.freshnessPolicy,
  );

  if (sourceFreshness.status === "CONFLICTED") {
    return finalize(
      input,
      sourceFreshness,
      "CONFLICTED",
      "SOURCE_FRESHNESS_CONFLICTED",
      null,
      null,
      [
        ...sourceFreshness.limitations,
        "Conflicted source chronology or timestamps must be reconciled before a canonical revenue decision is built.",
      ],
    );
  }

  if (sourceFreshness.status !== "READY" || !sourceFreshness.acceptedInput) {
    return finalize(
      input,
      sourceFreshness,
      "NOT_READY",
      "SOURCE_FRESHNESS_NOT_READY",
      null,
      null,
      [
        ...sourceFreshness.limitations,
        "All WooCommerce, GA4, and Meta observations must remain current under explicit decision-time freshness limits.",
      ],
    );
  }

  const decision = buildRevenueDecisionPacketV1(sourceFreshness.acceptedInput);
  if (decision.status !== "READY_FOR_DECISION") {
    return finalize(
      input,
      sourceFreshness,
      "NOT_READY",
      "REVENUE_DECISION_NOT_READY",
      decision,
      null,
      [
        ...decision.limitations,
        "Fresh source timestamps do not upgrade structurally incomplete or decision-insufficient revenue evidence.",
      ],
    );
  }

  return finalize(
    input,
    sourceFreshness,
    "READY",
    "FRESH_REVENUE_DECISION_READY",
    decision,
    decision,
    [
      ...decision.limitations,
      "The canonical decision was rebuilt only after WooCommerce, GA4, and Meta evidence remained current at the explicit evaluation instant.",
      "A READY decision remains bounded decision support; it does not establish causality, channel attribution, expected lift, confidence, or monetary impact and grants no provider-write authority.",
    ],
  );
}

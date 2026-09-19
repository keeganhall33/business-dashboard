import type { ClarityBehaviorViewModelV1 } from "@/lib/clarity-behavior/view-model-v1";
import type { CheckoutDiagnosticsViewModelV1 } from "@/lib/checkout-diagnostics/view-model-v1";
import {
  buildRevenueBehavioralCorroborationV1,
  type RevenueBehavioralCorroborationReasonV1,
  type RevenueBehavioralCorroborationStateV1,
  type RevenueBehavioralCorroborationV1,
} from "./behavioral-corroboration-v1";
import {
  revalidateCheckoutFreshnessV1,
  type CheckoutFreshnessRevalidationV1,
} from "./checkout-freshness-revalidation-v1";
import {
  revalidateClarityFreshnessV1,
  type ClarityFreshnessRevalidationV1,
} from "./clarity-freshness-revalidation-v1";
import type { RevenueDecisionPacketInputV1 } from "./decision-packet-v1";
import {
  buildFreshRevenueDecisionV1,
  type FreshRevenueDecisionV1,
} from "./fresh-revenue-decision-v1";
import type { RevenueSourceFreshnessPolicyV1 } from "./source-freshness-revalidation-v1";

export const BEHAVIORAL_FRESHNESS_CORROBORATION_VERSION =
  "BEHAVIORAL_FRESHNESS_CORROBORATION_V2" as const;

export type BehavioralFreshnessCorroborationStatusV1 =
  | "READY"
  | "NOT_READY"
  | "CONFLICTED";

export type BehavioralFreshnessCorroborationReasonV1 =
  | "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED"
  | "REVENUE_FRESHNESS_NOT_READY"
  | "CLARITY_FRESHNESS_NOT_READY"
  | "CHECKOUT_FRESHNESS_NOT_READY"
  | "MULTIPLE_SOURCES_NOT_READY"
  | "CROSS_SOURCE_FRESHNESS_CONFLICTED"
  | "CORROBORATION_NOT_READY"
  | "CORROBORATION_CONFLICTED";

export type BehavioralFreshnessCorroborationInputV1 = {
  revenueInput: RevenueDecisionPacketInputV1;
  evaluatedAt: string;
  revenueFreshnessPolicy: RevenueSourceFreshnessPolicyV1;
  clarity: ClarityBehaviorViewModelV1 | null;
  checkout: CheckoutDiagnosticsViewModelV1 | null;
  clarityMaxAgeHours: number;
  checkoutMaxAgeHours: number;
};

export type BehavioralFreshnessCorroborationV1 = {
  version: typeof BEHAVIORAL_FRESHNESS_CORROBORATION_VERSION;
  status: BehavioralFreshnessCorroborationStatusV1;
  reasonCode: BehavioralFreshnessCorroborationReasonV1;
  evaluatedAt: string;
  revenueFreshness: FreshRevenueDecisionV1;
  clarityFreshness: ClarityFreshnessRevalidationV1;
  checkoutFreshness: CheckoutFreshnessRevalidationV1;
  corroborationState: RevenueBehavioralCorroborationStateV1 | null;
  corroborationReasonCode: RevenueBehavioralCorroborationReasonV1 | null;
  acceptedCorroboration: RevenueBehavioralCorroborationV1 | null;
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
  input: BehavioralFreshnessCorroborationInputV1,
  revenueFreshness: FreshRevenueDecisionV1,
  clarityFreshness: ClarityFreshnessRevalidationV1,
  checkoutFreshness: CheckoutFreshnessRevalidationV1,
  status: BehavioralFreshnessCorroborationStatusV1,
  reasonCode: BehavioralFreshnessCorroborationReasonV1,
  corroboration: RevenueBehavioralCorroborationV1 | null,
  acceptedCorroboration: RevenueBehavioralCorroborationV1 | null,
  limitations: readonly string[],
): BehavioralFreshnessCorroborationV1 {
  return Object.freeze({
    version: BEHAVIORAL_FRESHNESS_CORROBORATION_VERSION,
    status,
    reasonCode,
    evaluatedAt: input.evaluatedAt,
    revenueFreshness,
    clarityFreshness,
    checkoutFreshness,
    corroborationState: corroboration?.state ?? null,
    corroborationReasonCode: corroboration?.reasonCode ?? null,
    acceptedCorroboration,
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

function freshnessLimitations(
  revenueFreshness: FreshRevenueDecisionV1,
  clarityFreshness: ClarityFreshnessRevalidationV1,
  checkoutFreshness: CheckoutFreshnessRevalidationV1,
): string[] {
  return [
    `Revenue freshness: ${revenueFreshness.status}/${revenueFreshness.reasonCode}.`,
    `Clarity freshness: ${clarityFreshness.status}/${clarityFreshness.reasonCode}.`,
    `Checkout freshness: ${checkoutFreshness.status}/${checkoutFreshness.reasonCode}.`,
  ];
}

/**
 * Revalidates the complete canonical revenue + behavioral evidence bundle at
 * one explicit decision instant before any source may participate in
 * recommendation-grade corroboration.
 *
 * WooCommerce, GA4, and Meta are revalidated through the canonical fresh
 * revenue-decision boundary. Clarity and checkout diagnostics are independently
 * revalidated at the same caller-owned instant. A source that was CURRENT or
 * READY when originally observed can therefore age out before this synthesis
 * runs without being silently promoted into present-tense decision support.
 *
 * This boundary intentionally requires all five source classes to remain fresh
 * and decision-grade. Missing, stale, partial, conflicted, future, malformed,
 * date-mismatched, or policy-invalid evidence fails closed. A READY result is
 * still observational decision support only: it does not establish causality,
 * revenue/channel attribution, expected lift, confidence, monetary value, or
 * authority to mutate the website, checkout, pricing, email, WooCommerce, GA4,
 * Meta, Clarity, FunnelKit, or any other provider.
 */
export function buildFreshRevenueBehavioralCorroborationV1(
  input: BehavioralFreshnessCorroborationInputV1,
): BehavioralFreshnessCorroborationV1 {
  const revenueFreshness = buildFreshRevenueDecisionV1({
    revenueInput: input.revenueInput,
    evaluatedAt: input.evaluatedAt,
    freshnessPolicy: input.revenueFreshnessPolicy,
  });
  const clarityFreshness = revalidateClarityFreshnessV1({
    clarity: input.clarity,
    evaluatedAt: input.evaluatedAt,
    maxAgeHours: input.clarityMaxAgeHours,
  });
  const checkoutFreshness = revalidateCheckoutFreshnessV1({
    checkout: input.checkout,
    evaluatedAt: input.evaluatedAt,
    maxAgeHours: input.checkoutMaxAgeHours,
  });

  const freshnessSummary = freshnessLimitations(
    revenueFreshness,
    clarityFreshness,
    checkoutFreshness,
  );

  if (
    revenueFreshness.status === "CONFLICTED"
    || clarityFreshness.status === "CONFLICTED"
    || checkoutFreshness.status === "CONFLICTED"
  ) {
    return finalize(
      input,
      revenueFreshness,
      clarityFreshness,
      checkoutFreshness,
      "CONFLICTED",
      "CROSS_SOURCE_FRESHNESS_CONFLICTED",
      null,
      null,
      [
        ...freshnessSummary,
        "Conflicted source chronology, timestamps, or source truth must be reconciled before revenue behavioral corroboration can run.",
      ],
    );
  }

  const revenueReady =
    revenueFreshness.status === "READY"
    && revenueFreshness.acceptedDecision !== null
    && revenueFreshness.sourceFreshness.acceptedInput !== null;
  const clarityReady = clarityFreshness.status === "READY";
  const checkoutReady = checkoutFreshness.status === "READY";

  if (!revenueReady || !clarityReady || !checkoutReady) {
    const notReadyCount = [revenueReady, clarityReady, checkoutReady].filter(
      (ready) => !ready,
    ).length;
    const reasonCode: BehavioralFreshnessCorroborationReasonV1 =
      notReadyCount > 1
        ? "MULTIPLE_SOURCES_NOT_READY"
        : !revenueReady
          ? "REVENUE_FRESHNESS_NOT_READY"
          : !clarityReady
            ? "CLARITY_FRESHNESS_NOT_READY"
            : "CHECKOUT_FRESHNESS_NOT_READY";

    return finalize(
      input,
      revenueFreshness,
      clarityFreshness,
      checkoutFreshness,
      "NOT_READY",
      reasonCode,
      null,
      null,
      [
        ...freshnessSummary,
        "The closed revenue + behavioral loop requires WooCommerce, GA4, Meta, Clarity, and checkout evidence to remain decision-grade and fresh at the same explicit evaluation instant.",
      ],
    );
  }

  const acceptedRevenueInput = revenueFreshness.sourceFreshness.acceptedInput;
  if (!acceptedRevenueInput) {
    return finalize(
      input,
      revenueFreshness,
      clarityFreshness,
      checkoutFreshness,
      "NOT_READY",
      "REVENUE_FRESHNESS_NOT_READY",
      null,
      null,
      [
        ...freshnessSummary,
        "Fresh revenue evidence did not expose an accepted canonical input, so behavioral corroboration is withheld.",
      ],
    );
  }

  const corroboration = buildRevenueBehavioralCorroborationV1({
    revenueInput: acceptedRevenueInput,
    clarity: clarityFreshness.acceptedClarity,
    checkout: checkoutFreshness.acceptedCheckout,
  });

  if (corroboration.state === "CONFLICTED") {
    return finalize(
      input,
      revenueFreshness,
      clarityFreshness,
      checkoutFreshness,
      "CONFLICTED",
      "CORROBORATION_CONFLICTED",
      corroboration,
      null,
      [
        ...corroboration.limitations,
        "Fresh source timestamps do not override contradictory corroboration evidence.",
      ],
    );
  }

  if (corroboration.state === "INSUFFICIENT_EVIDENCE") {
    return finalize(
      input,
      revenueFreshness,
      clarityFreshness,
      checkoutFreshness,
      "NOT_READY",
      "CORROBORATION_NOT_READY",
      corroboration,
      null,
      [
        ...corroboration.limitations,
        "Freshness alone does not make incomplete, date-mismatched, or otherwise insufficient corroboration recommendation-grade.",
      ],
    );
  }

  return finalize(
    input,
    revenueFreshness,
    clarityFreshness,
    checkoutFreshness,
    "READY",
    "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED",
    corroboration,
    corroboration,
    [
      ...corroboration.limitations,
      "WooCommerce, GA4, Meta, Clarity, and checkout evidence were independently revalidated at one explicit decision instant under caller-owned freshness limits.",
      "The accepted corroboration remains observational and cannot establish causality, attribution, expected lift, confidence, or monetary impact.",
    ],
  );
}

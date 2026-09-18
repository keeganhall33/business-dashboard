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

export const BEHAVIORAL_FRESHNESS_CORROBORATION_VERSION =
  "BEHAVIORAL_FRESHNESS_CORROBORATION_V1" as const;

export type BehavioralFreshnessCorroborationStatusV1 =
  | "READY"
  | "NOT_READY"
  | "CONFLICTED";

export type BehavioralFreshnessCorroborationReasonV1 =
  | "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED"
  | "CLARITY_FRESHNESS_NOT_READY"
  | "CHECKOUT_FRESHNESS_NOT_READY"
  | "MULTIPLE_BEHAVIORAL_SOURCES_NOT_READY"
  | "BEHAVIORAL_FRESHNESS_CONFLICTED"
  | "CORROBORATION_NOT_READY"
  | "CORROBORATION_CONFLICTED";

export type BehavioralFreshnessCorroborationInputV1 = {
  revenueInput: RevenueDecisionPacketInputV1;
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
    evaluatedAt: input.revenueInput.generatedAt,
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

/**
 * Revalidates both canonical behavioral sources at the exact revenue-decision
 * instant before either source may participate in recommendation-grade
 * corroboration.
 *
 * This intentionally requires a complete fresh behavioral bundle. The lower
 * level corroboration primitive can investigate with one eligible source, but
 * the closed revenue-decision path must not silently promote a fresh source
 * while its companion source is missing, stale, partial, or conflicted.
 * Caller-owned freshness limits remain explicit and independent per source.
 *
 * A READY result means only that the existing corroboration result was formed
 * from a complete fresh behavioral bundle and is safe for internal review. It
 * does not establish causality, revenue or channel attribution, expected lift,
 * confidence, monetary value, or authority to mutate the site, checkout,
 * pricing, spend, Clarity, FunnelKit, WooCommerce, GA4, or Meta.
 */
export function buildFreshRevenueBehavioralCorroborationV1(
  input: BehavioralFreshnessCorroborationInputV1,
): BehavioralFreshnessCorroborationV1 {
  const clarityFreshness = revalidateClarityFreshnessV1({
    clarity: input.clarity,
    evaluatedAt: input.revenueInput.generatedAt,
    maxAgeHours: input.clarityMaxAgeHours,
  });
  const checkoutFreshness = revalidateCheckoutFreshnessV1({
    checkout: input.checkout,
    evaluatedAt: input.revenueInput.generatedAt,
    maxAgeHours: input.checkoutMaxAgeHours,
  });

  if (
    clarityFreshness.status === "CONFLICTED"
    || checkoutFreshness.status === "CONFLICTED"
  ) {
    return finalize(
      input,
      clarityFreshness,
      checkoutFreshness,
      "CONFLICTED",
      "BEHAVIORAL_FRESHNESS_CONFLICTED",
      null,
      null,
      [
        `Clarity freshness: ${clarityFreshness.status}/${clarityFreshness.reasonCode}.`,
        `Checkout freshness: ${checkoutFreshness.status}/${checkoutFreshness.reasonCode}.`,
        "Conflicted behavioral evidence must be reconciled before revenue corroboration can run.",
      ],
    );
  }

  const clarityReady = clarityFreshness.status === "READY";
  const checkoutReady = checkoutFreshness.status === "READY";
  if (!clarityReady || !checkoutReady) {
    const reasonCode: BehavioralFreshnessCorroborationReasonV1 =
      !clarityReady && !checkoutReady
        ? "MULTIPLE_BEHAVIORAL_SOURCES_NOT_READY"
        : !clarityReady
          ? "CLARITY_FRESHNESS_NOT_READY"
          : "CHECKOUT_FRESHNESS_NOT_READY";
    return finalize(
      input,
      clarityFreshness,
      checkoutFreshness,
      "NOT_READY",
      reasonCode,
      null,
      null,
      [
        `Clarity freshness: ${clarityFreshness.status}/${clarityFreshness.reasonCode}.`,
        `Checkout freshness: ${checkoutFreshness.status}/${checkoutFreshness.reasonCode}.`,
        "The closed behavioral loop requires both canonical sources to be decision-grade and fresh; partial freshness is not promoted into a recommendation.",
      ],
    );
  }

  const corroboration = buildRevenueBehavioralCorroborationV1({
    revenueInput: input.revenueInput,
    clarity: clarityFreshness.acceptedClarity,
    checkout: checkoutFreshness.acceptedCheckout,
  });

  if (corroboration.state === "CONFLICTED") {
    return finalize(
      input,
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
    clarityFreshness,
    checkoutFreshness,
    "READY",
    "FRESH_BEHAVIORAL_EVIDENCE_EVALUATED",
    corroboration,
    corroboration,
    [
      ...corroboration.limitations,
      "Both behavioral sources were independently revalidated at the exact revenue-decision instant under caller-owned freshness limits.",
      "The accepted corroboration remains observational and cannot establish causality, attribution, expected lift, confidence, or monetary impact.",
    ],
  );
}

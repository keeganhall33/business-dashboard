import type { CheckoutSourceReconciliationV1 } from "@/lib/checkout-diagnostics/source-reconciliation-v1";
import type { RevenueBehavioralCorroborationV1 } from "./behavioral-corroboration-v1";

export const CONVERSION_FRICTION_READINESS_VERSION =
  "CONVERSION_FRICTION_READINESS_V1" as const;

export type ConversionFrictionReadinessStatusV1 =
  | "READY_TO_PREPARE_TEST"
  | "VERIFY_TRACKING"
  | "CONTINUE_DIAGNOSIS"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_APPLICABLE"
  | "CONFLICTED";

export type ConversionFrictionReadinessReasonV1 =
  | "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE"
  | "CLARITY_SUPPORT_WITHOUT_CHECKOUT_CLAIM"
  | "CHECKOUT_RECONCILIATION_REQUIRED"
  | "CHECKOUT_RECONCILIATION_RANGE_MISMATCH"
  | "CHECKOUT_MEASUREMENT_DISAGREEMENT"
  | "CHECKOUT_RECONCILIATION_NOT_DECISION_GRADE"
  | "CHECKOUT_RECONCILIATION_INTEGRITY_FAILURE"
  | "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL"
  | "BEHAVIORAL_EVIDENCE_INSUFFICIENT"
  | "BEHAVIORAL_EVIDENCE_CONFLICTED"
  | "REVENUE_DRIVER_NOT_CONVERSION"
  | "SUPPORTED_STATE_WITHOUT_SUPPORTING_EVIDENCE";

export type ConversionFrictionReadinessInputV1 = {
  behavioral: RevenueBehavioralCorroborationV1;
  checkoutReconciliation: CheckoutSourceReconciliationV1 | null;
};

export type ConversionFrictionReadinessV1 = {
  version: typeof CONVERSION_FRICTION_READINESS_VERSION;
  status: ConversionFrictionReadinessStatusV1;
  reasonCode: ConversionFrictionReadinessReasonV1;
  recommendationId: string;
  revenueDriver: RevenueBehavioralCorroborationV1["decision"]["revenueDriver"];
  evidenceBasis: {
    clarityUsed: boolean;
    checkoutUsed: boolean;
    supportingFacts: readonly string[];
  };
  checkoutMeasurement: {
    required: boolean;
    status: CheckoutSourceReconciliationV1["status"] | "NOT_REQUIRED" | "MISSING";
    reasonCode: string | null;
    evidenceRefs: readonly string[];
    comparisonCount: number;
  };
  limitations: readonly string[];
  nextStep: {
    kind:
      | "PREPARE_BOUNDED_CONVERSION_TEST"
      | "VERIFY_TRACKING"
      | "CONTINUE_DIAGNOSIS"
      | "RECONCILE_EVIDENCE"
      | "NO_BEHAVIORAL_OVERRIDE";
    approvalClass: "AUTO_CONTINUE" | "KEEGAN_APPROVAL_REQUIRED";
    description: string;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  };
  causalClaim: false;
  revenueAttributionClaim: false;
  expectedLift: null;
  monetaryValue: null;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function sameRange(
  left: { startDate: string; endDate: string },
  right: { startDate: string; endDate: string },
): boolean {
  return left.startDate === right.startDate && left.endDate === right.endDate;
}

function sourceEvidenceRefs(
  reconciliation: CheckoutSourceReconciliationV1 | null,
): string[] {
  if (!reconciliation) return [];
  return [
    ...new Set(
      reconciliation.sourceCoverage.flatMap((source) => source.evidenceRefs),
    ),
  ].sort();
}

function checkoutReadyIntegrity(
  reconciliation: CheckoutSourceReconciliationV1,
): boolean {
  if (reconciliation.status !== "READY" || reconciliation.comparisons.length === 0) {
    return false;
  }
  if (reconciliation.comparisons.some((comparison) => comparison.materialDifference)) {
    return false;
  }
  const evidencedCompleteSources = reconciliation.sourceCoverage.filter(
    (source) => source.truthState === "COMPLETE" && source.evidenceRefs.length > 0,
  );
  return evidencedCompleteSources.length >= 2;
}

function nextStep(
  status: ConversionFrictionReadinessStatusV1,
): ConversionFrictionReadinessV1["nextStep"] {
  switch (status) {
    case "READY_TO_PREPARE_TEST":
      return {
        kind: "PREPARE_BOUNDED_CONVERSION_TEST",
        approvalClass: "KEEGAN_APPROVAL_REQUIRED",
        description:
          "Prepare a bounded conversion test proposal around the observed friction signal. Treat the mechanism as a hypothesis; any site, checkout, pricing, email, paid-media, or other production change remains subject to the existing approval policy.",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "VERIFY_TRACKING":
      return {
        kind: "VERIFY_TRACKING",
        approvalClass: "AUTO_CONTINUE",
        description:
          "Verify checkout measurement definitions and tracking before using checkout evidence to justify a conversion test.",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "CONTINUE_DIAGNOSIS":
      return {
        kind: "CONTINUE_DIAGNOSIS",
        approvalClass: "AUTO_CONTINUE",
        description:
          "Continue bounded diagnosis or collect more behavior evidence; do not manufacture a conversion-friction recommendation.",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "NOT_APPLICABLE":
      return {
        kind: "NO_BEHAVIORAL_OVERRIDE",
        approvalClass: "AUTO_CONTINUE",
        description:
          "Keep behavior evidence contextual only because the canonical revenue driver is not conversion.",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "INSUFFICIENT_EVIDENCE":
    case "CONFLICTED":
      return {
        kind: "RECONCILE_EVIDENCE",
        approvalClass: "AUTO_CONTINUE",
        description:
          "Reconcile missing, stale, partial, conflicted, mismatched, or internally inconsistent evidence before preparing a conversion test.",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
  }
}

function finalize(
  input: ConversionFrictionReadinessInputV1,
  status: ConversionFrictionReadinessStatusV1,
  reasonCode: ConversionFrictionReadinessReasonV1,
  limitations: readonly string[],
): ConversionFrictionReadinessV1 {
  const checkoutUsed = input.behavioral.supportingFacts.some((fact) =>
    fact.startsWith("Checkout:"),
  );
  const clarityUsed = input.behavioral.supportingFacts.some((fact) =>
    fact.startsWith("Clarity:"),
  );
  const reconciliation = input.checkoutReconciliation;

  return deepFreeze({
    version: CONVERSION_FRICTION_READINESS_VERSION,
    status,
    reasonCode,
    recommendationId: input.behavioral.decision.recommendationId,
    revenueDriver: input.behavioral.decision.revenueDriver,
    evidenceBasis: {
      clarityUsed,
      checkoutUsed,
      supportingFacts: [...input.behavioral.supportingFacts],
    },
    checkoutMeasurement: {
      required: checkoutUsed,
      status: checkoutUsed
        ? reconciliation?.status ?? "MISSING"
        : "NOT_REQUIRED",
      reasonCode: checkoutUsed ? reconciliation?.reasonCode ?? null : null,
      evidenceRefs: checkoutUsed ? sourceEvidenceRefs(reconciliation) : [],
      comparisonCount: checkoutUsed ? reconciliation?.comparisons.length ?? 0 : 0,
    },
    limitations: [...new Set([...input.behavioral.limitations, ...limitations])],
    nextStep: nextStep(status),
    causalClaim: false,
    revenueAttributionClaim: false,
    expectedLift: null,
    monetaryValue: null,
  });
}

/**
 * Read-only fail-closed gate between revenue/behavior corroboration and conversion
 * experiment preparation. Checkout friction may advance only after like-for-like
 * FunnelKit/Woo/GA4 completion evidence is reconciled. This projection never
 * establishes causality, attribution, expected lift, monetary impact, or action
 * authority.
 */
export function buildConversionFrictionReadinessV1(
  input: ConversionFrictionReadinessInputV1,
): ConversionFrictionReadinessV1 {
  const behavioral = input.behavioral;

  if (behavioral.state === "NOT_APPLICABLE") {
    return finalize(
      input,
      "NOT_APPLICABLE",
      "REVENUE_DRIVER_NOT_CONVERSION",
      [],
    );
  }

  if (behavioral.state === "CONFLICTED") {
    return finalize(
      input,
      "CONFLICTED",
      "BEHAVIORAL_EVIDENCE_CONFLICTED",
      ["Conflicted behavioral evidence cannot justify conversion-test preparation."],
    );
  }

  if (behavioral.state === "INSUFFICIENT_EVIDENCE") {
    return finalize(
      input,
      "INSUFFICIENT_EVIDENCE",
      "BEHAVIORAL_EVIDENCE_INSUFFICIENT",
      [],
    );
  }

  if (behavioral.state === "NOT_CORROBORATED") {
    return finalize(
      input,
      "CONTINUE_DIAGNOSIS",
      "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL",
      [],
    );
  }

  if (behavioral.supportingFacts.length === 0) {
    return finalize(
      input,
      "INSUFFICIENT_EVIDENCE",
      "SUPPORTED_STATE_WITHOUT_SUPPORTING_EVIDENCE",
      ["A supported behavioral state without supporting facts is internally inconsistent and fails closed."],
    );
  }

  const checkoutUsed = behavioral.supportingFacts.some((fact) =>
    fact.startsWith("Checkout:"),
  );
  if (!checkoutUsed) {
    return finalize(
      input,
      "READY_TO_PREPARE_TEST",
      "CLARITY_SUPPORT_WITHOUT_CHECKOUT_CLAIM",
      [
        "Clarity behavior supports investigation only; it does not establish the cause of the conversion movement.",
      ],
    );
  }

  const reconciliation = input.checkoutReconciliation;
  if (!reconciliation) {
    return finalize(
      input,
      "INSUFFICIENT_EVIDENCE",
      "CHECKOUT_RECONCILIATION_REQUIRED",
      [
        "Checkout friction is present, but like-for-like FunnelKit/Woo/GA4 completion evidence has not been reconciled.",
      ],
    );
  }

  if (!sameRange(reconciliation.expectedRange, behavioral.decision.currentRange)) {
    return finalize(
      input,
      "INSUFFICIENT_EVIDENCE",
      "CHECKOUT_RECONCILIATION_RANGE_MISMATCH",
      [
        "Checkout source reconciliation does not cover the same current period as the canonical revenue decision.",
      ],
    );
  }

  if (reconciliation.status === "VERIFY_TRACKING") {
    return finalize(
      input,
      "VERIFY_TRACKING",
      "CHECKOUT_MEASUREMENT_DISAGREEMENT",
      [
        "Material cross-source completion disagreement must be resolved before checkout evidence can justify a conversion test.",
      ],
    );
  }

  if (reconciliation.status === "CONFLICTED") {
    return finalize(
      input,
      "CONFLICTED",
      "CHECKOUT_RECONCILIATION_NOT_DECISION_GRADE",
      ["Conflicted checkout reconciliation evidence fails closed."],
    );
  }

  if (reconciliation.status !== "READY") {
    return finalize(
      input,
      "INSUFFICIENT_EVIDENCE",
      "CHECKOUT_RECONCILIATION_NOT_DECISION_GRADE",
      [
        `Checkout reconciliation is ${reconciliation.status} and cannot support conversion-test preparation.`,
      ],
    );
  }

  if (!checkoutReadyIntegrity(reconciliation)) {
    return finalize(
      input,
      "CONFLICTED",
      "CHECKOUT_RECONCILIATION_INTEGRITY_FAILURE",
      [
        "Checkout reconciliation reports READY without coherent evidence-backed comparisons and fails closed.",
      ],
    );
  }

  return finalize(
    input,
    "READY_TO_PREPARE_TEST",
    "BEHAVIORAL_SUPPORT_AND_MEASUREMENT_AGREE",
    [
      "Cross-source completion counts agree within the caller-supplied tolerance. This corroborates measurement only and does not establish checkout causality.",
    ],
  );
}

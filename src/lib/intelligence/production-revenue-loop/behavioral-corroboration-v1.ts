import type { ClarityBehaviorViewModelV1 } from "@/lib/clarity-behavior/view-model-v1";
import type { CheckoutDiagnosticsViewModelV1 } from "@/lib/checkout-diagnostics/view-model-v1";
import {
  buildRevenueDecisionPacketV1,
  type RevenueDecisionPacketInputV1,
  type RevenueDecisionPacketV1,
} from "./decision-packet-v1";

export const REVENUE_BEHAVIORAL_CORROBORATION_VERSION =
  "REVENUE_BEHAVIORAL_CORROBORATION_V1" as const;

const MAX_SUPPORTING_FACTS = 6;
const MAX_LIMITATIONS = 8;

export type RevenueBehavioralCorroborationStateV1 =
  | "SUPPORTED_FOR_INVESTIGATION"
  | "NOT_CORROBORATED"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_APPLICABLE"
  | "CONFLICTED";

export type RevenueBehavioralCorroborationReasonV1 =
  | "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT"
  | "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL"
  | "REVENUE_DECISION_NOT_READY"
  | "BEHAVIORAL_EVIDENCE_NOT_DECISION_GRADE"
  | "BEHAVIORAL_DATE_RANGE_MISMATCH"
  | "BEHAVIORAL_EVIDENCE_CONFLICTED"
  | "REVENUE_DRIVER_NOT_CONVERSION";

export type RevenueBehavioralSourceStatusV1 = {
  source: "CLARITY" | "CHECKOUT";
  state: string;
  decisionGrade: boolean;
  rangeMatch: boolean;
  eligible: boolean;
  observedAt: string | null;
  completeThrough: string | null;
};

export type RevenueBehavioralCorroborationV1 = {
  version: typeof REVENUE_BEHAVIORAL_CORROBORATION_VERSION;
  state: RevenueBehavioralCorroborationStateV1;
  reasonCode: RevenueBehavioralCorroborationReasonV1;
  decision: {
    recommendationId: string;
    revenueStatus: RevenueDecisionPacketV1["status"];
    revenueDriver: RevenueDecisionPacketV1["primaryDriver"]["driver"];
    currentRange: { startDate: string; endDate: string };
    comparisonRange: { startDate: string; endDate: string };
  };
  sourceStatus: readonly RevenueBehavioralSourceStatusV1[];
  supportingFacts: readonly string[];
  limitations: readonly string[];
  nextStep: {
    kind:
      | "PREPARE_CONVERSION_EXPERIMENT"
      | "RECONCILE_EVIDENCE"
      | "CONTINUE_DIAGNOSIS"
      | "NO_BEHAVIORAL_OVERRIDE";
    description: string;
    approvalClass: "AUTO_CONTINUE" | "KEEGAN_APPROVAL_REQUIRED";
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  };
  causalClaim: false;
  attributionStatement: string;
};

export type RevenueBehavioralCorroborationInputV1 = {
  revenueInput: RevenueDecisionPacketInputV1;
  clarity: ClarityBehaviorViewModelV1 | null;
  checkout: CheckoutDiagnosticsViewModelV1 | null;
};

function sameRange(
  left: { startDate: string; endDate: string } | null | undefined,
  right: { startDate: string; endDate: string },
): boolean {
  return left?.startDate === right.startDate && left?.endDate === right.endDate;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function clarityStatus(
  view: ClarityBehaviorViewModelV1 | null,
  input: RevenueDecisionPacketInputV1,
): RevenueBehavioralSourceStatusV1 {
  const rangeMatch = Boolean(
    view
      && sameRange(view.currentRange, input.currentRange)
      && sameRange(view.priorRange, input.comparisonRange),
  );
  const decisionGrade = view?.decisionGrade === true;
  return {
    source: "CLARITY",
    state: view?.state ?? "MISSING",
    decisionGrade,
    rangeMatch,
    eligible: decisionGrade && rangeMatch,
    observedAt: view?.extractedAt ?? null,
    completeThrough: view?.completeThrough ?? null,
  };
}

function checkoutStatus(
  view: CheckoutDiagnosticsViewModelV1 | null,
  input: RevenueDecisionPacketInputV1,
): RevenueBehavioralSourceStatusV1 {
  const rangeMatch = Boolean(
    view
      && sameRange(view.currentRange, input.currentRange)
      && sameRange(view.priorRange, input.comparisonRange),
  );
  const decisionGrade = view?.decisionGrade === true;
  return {
    source: "CHECKOUT",
    state: view?.state ?? "MISSING",
    decisionGrade,
    rangeMatch,
    eligible: decisionGrade && rangeMatch,
    observedAt: view?.asOf ?? null,
    completeThrough: view?.completeThrough ?? null,
  };
}

function checkoutFacts(view: CheckoutDiagnosticsViewModelV1): string[] {
  const facts: string[] = [];
  if (view.largestDropoff && view.largestDropoff.dropoffRate >= 0.3) {
    facts.push(
      `Checkout: ${(view.largestDropoff.dropoffRate * 100).toFixed(1)}% adjacent-stage drop-off from ${view.largestDropoff.fromLabel} to ${view.largestDropoff.toLabel}.`,
    );
  }
  if (view.shippingLatency?.materialAlert) {
    const share = view.shippingLatency.slowWaitShare;
    facts.push(
      share === null
        ? "Checkout: shipping-method latency crossed the existing materiality threshold."
        : `Checkout: ${(share * 100).toFixed(1)}% of measured shipping-method waits were at least four seconds, crossing the existing materiality threshold.`,
    );
  }
  if (view.errors && view.errors.total_errors >= 2) {
    facts.push(`Checkout: ${view.errors.total_errors} checkout errors were observed in the selected range.`);
  }
  return facts;
}

function clarityFacts(view: ClarityBehaviorViewModelV1): string[] {
  return view.findings.slice(0, 3).map((finding) => `Clarity: ${finding.fact}`);
}

function limitationsForSources(
  statuses: readonly RevenueBehavioralSourceStatusV1[],
): string[] {
  const limitations: string[] = [];
  for (const status of statuses) {
    if (status.state === "MISSING") {
      limitations.push(`${status.source} behavioral evidence is missing.`);
      continue;
    }
    if (!status.rangeMatch) {
      limitations.push(`${status.source} behavioral date ranges do not exactly match the revenue decision ranges.`);
      continue;
    }
    if (!status.decisionGrade) {
      limitations.push(`${status.source} behavioral evidence is ${status.state} and is excluded from corroboration.`);
    }
  }
  return limitations.slice(0, MAX_LIMITATIONS);
}

function nextStep(
  state: RevenueBehavioralCorroborationStateV1,
): RevenueBehavioralCorroborationV1["nextStep"] {
  switch (state) {
    case "SUPPORTED_FOR_INVESTIGATION":
      return {
        kind: "PREPARE_CONVERSION_EXPERIMENT",
        description:
          "Prepare one bounded conversion experiment around the strongest observed friction signal. Keep pricing and Meta spend unchanged during the measurement window unless separately approved.",
        approvalClass: "KEEGAN_APPROVAL_REQUIRED",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "NOT_CORROBORATED":
      return {
        kind: "CONTINUE_DIAGNOSIS",
        description:
          "Do not manufacture a conversion-friction diagnosis. Continue bounded investigation of alternative hypotheses or gather more granular evidence before proposing a production change.",
        approvalClass: "AUTO_CONTINUE",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "NOT_APPLICABLE":
      return {
        kind: "NO_BEHAVIORAL_OVERRIDE",
        description:
          "Keep behavioral evidence contextual only; it must not override the canonical non-conversion revenue contributor.",
        approvalClass: "AUTO_CONTINUE",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
    case "CONFLICTED":
    case "INSUFFICIENT_EVIDENCE":
      return {
        kind: "RECONCILE_EVIDENCE",
        description:
          "Reconcile missing, stale, partial, conflicted, or date-mismatched behavioral evidence before using it to justify a conversion experiment.",
        approvalClass: "AUTO_CONTINUE",
        externalMutationAllowed: false,
        metaWriteAllowed: false,
      };
  }
}

function finalize(
  packet: RevenueDecisionPacketV1,
  revenueInput: RevenueDecisionPacketInputV1,
  sourceStatus: readonly RevenueBehavioralSourceStatusV1[],
  state: RevenueBehavioralCorroborationStateV1,
  reasonCode: RevenueBehavioralCorroborationReasonV1,
  supportingFacts: readonly string[],
  limitations: readonly string[],
): RevenueBehavioralCorroborationV1 {
  return deepFreeze({
    version: REVENUE_BEHAVIORAL_CORROBORATION_VERSION,
    state,
    reasonCode,
    decision: {
      recommendationId: packet.recommendedAction.id,
      revenueStatus: packet.status,
      revenueDriver: packet.primaryDriver.driver,
      currentRange: { ...revenueInput.currentRange },
      comparisonRange: { ...revenueInput.comparisonRange },
    },
    sourceStatus: sourceStatus.map((status) => ({ ...status })),
    supportingFacts: [...supportingFacts].slice(0, MAX_SUPPORTING_FACTS),
    limitations: [...limitations].slice(0, MAX_LIMITATIONS),
    nextStep: nextStep(state),
    causalClaim: false,
    attributionStatement:
      "Matched Clarity and checkout observations may corroborate where to investigate conversion friction, but they do not prove that the behavior caused revenue movement or establish Meta, channel, or experiment attribution.",
  });
}

/**
 * Bounded, pure synthesis over the existing canonical revenue decision builder,
 * Clarity behavioral view-model, and checkout diagnostics view-model. It grants
 * no production mutation or paid-media write authority.
 */
export function buildRevenueBehavioralCorroborationV1(
  input: RevenueBehavioralCorroborationInputV1,
): RevenueBehavioralCorroborationV1 {
  const packet = buildRevenueDecisionPacketV1(input.revenueInput);
  const statuses = [
    clarityStatus(input.clarity, input.revenueInput),
    checkoutStatus(input.checkout, input.revenueInput),
  ] as const;
  const limitations = limitationsForSources(statuses);

  if (packet.status !== "READY_FOR_DECISION" || packet.primaryDriver.state !== "SUPPORTED") {
    return finalize(
      packet,
      input.revenueInput,
      statuses,
      "INSUFFICIENT_EVIDENCE",
      "REVENUE_DECISION_NOT_READY",
      [],
      limitations,
    );
  }

  if (packet.primaryDriver.driver !== "CONVERSION") {
    return finalize(
      packet,
      input.revenueInput,
      statuses,
      "NOT_APPLICABLE",
      "REVENUE_DRIVER_NOT_CONVERSION",
      [],
      limitations,
    );
  }

  if (input.clarity?.state === "CONFLICTED" || input.checkout?.state === "CONFLICTED") {
    return finalize(
      packet,
      input.revenueInput,
      statuses,
      "CONFLICTED",
      "BEHAVIORAL_EVIDENCE_CONFLICTED",
      [],
      ["Conflicted behavioral evidence is fail-closed and cannot justify a conversion experiment.", ...limitations],
    );
  }

  const eligible = statuses.filter((status) => status.eligible);
  if (eligible.length === 0) {
    const hasMismatch = statuses.some((status) => status.state !== "MISSING" && !status.rangeMatch);
    return finalize(
      packet,
      input.revenueInput,
      statuses,
      "INSUFFICIENT_EVIDENCE",
      hasMismatch ? "BEHAVIORAL_DATE_RANGE_MISMATCH" : "BEHAVIORAL_EVIDENCE_NOT_DECISION_GRADE",
      [],
      limitations,
    );
  }

  const facts: string[] = [];
  if (statuses[1].eligible && input.checkout) facts.push(...checkoutFacts(input.checkout));
  if (statuses[0].eligible && input.clarity) facts.push(...clarityFacts(input.clarity));

  if (facts.length === 0) {
    return finalize(
      packet,
      input.revenueInput,
      statuses,
      "NOT_CORROBORATED",
      "NO_MATERIAL_BEHAVIORAL_FRICTION_SIGNAL",
      [],
      limitations,
    );
  }

  return finalize(
    packet,
    input.revenueInput,
    statuses,
    "SUPPORTED_FOR_INVESTIGATION",
    "CONVERSION_SIGNAL_HAS_BEHAVIORAL_SUPPORT",
    facts,
    limitations,
  );
}

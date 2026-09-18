import { summarizeCheckoutErrors, type CheckoutErrorSummary } from "./error-summary";

export const CHECKOUT_STAGE_ORDER = [
  "CHECKOUT_LOADED",
  "CUSTOMER_INFO_STARTED",
  "CUSTOMER_INFO_COMPLETED",
  "SHIPPING_METHODS_LOADED",
  "SHIPPING_METHOD_SELECTED",
  "SHIPPING_TOTAL_SHOWN",
  "PAYMENT_SECTION_VISIBLE",
  "PAYMENT_METHODS_LOADED",
  "PAYMENT_METHOD_SELECTED",
  "PLACE_ORDER_CLICKED",
  "ORDER_CREATED",
  "PURCHASE",
] as const;

export type CheckoutStageKey = (typeof CHECKOUT_STAGE_ORDER)[number];
export type CheckoutDiagnosticsState = "WAITING_FOR_INSTRUMENTATION" | "PARTIAL" | "READY" | "UNAVAILABLE" | "CONFLICTED";
export type EvidenceTruthState = "COMPLETE" | "PARTIAL" | "UNKNOWN" | "STALE" | "CONFLICTED" | "UNAVAILABLE";

export const CHECKOUT_STAGE_LABELS: Record<CheckoutStageKey, string> = {
  CHECKOUT_LOADED: "Checkout loaded",
  CUSTOMER_INFO_STARTED: "Customer info started",
  CUSTOMER_INFO_COMPLETED: "Customer info completed",
  SHIPPING_METHODS_LOADED: "Shipping methods loaded",
  SHIPPING_METHOD_SELECTED: "Shipping method selected",
  SHIPPING_TOTAL_SHOWN: "Shipping total shown",
  PAYMENT_SECTION_VISIBLE: "Payment section visible",
  PAYMENT_METHODS_LOADED: "Payment methods loaded",
  PAYMENT_METHOD_SELECTED: "Payment method selected",
  PLACE_ORDER_CLICKED: "Place order clicked",
  ORDER_CREATED: "Order created",
  PURCHASE: "Purchase",
};

export interface CheckoutDateRangeV1 {
  startDate: string;
  endDate: string;
}

export interface CheckoutStagePeriodInputV1 {
  stages?: Partial<Record<CheckoutStageKey, unknown>> | null;
}

export interface CheckoutErrorInputV1 {
  validationErrors?: unknown;
  paymentErrors?: unknown;
  checkoutAjaxErrors?: unknown;
}

export interface CheckoutShippingLatencyInputV1 {
  sampleSize?: unknown;
  waitsAtLeastFourSeconds?: unknown;
  medianMs?: unknown;
  p95Ms?: unknown;
  mobileChromeSampleSize?: unknown;
  mobileChromeMedianMs?: unknown;
  mobileChromeP95Ms?: unknown;
  buckets?: Array<{ label: string; count: unknown }> | null;
}

export interface CheckoutSegmentInputV1 {
  device: string | null;
  source: string | null;
  checkoutLoaded?: unknown;
  purchases?: unknown;
}

export interface CheckoutDiagnosticsInputV1 {
  instrumentation: "ACTIVE" | "PARTIAL" | "INACTIVE" | "UNAVAILABLE" | "CONFLICTED";
  range: {
    current: CheckoutDateRangeV1;
    prior: CheckoutDateRangeV1;
  };
  current?: CheckoutStagePeriodInputV1 | null;
  prior?: CheckoutStagePeriodInputV1 | null;
  errors?: CheckoutErrorInputV1 | null;
  shippingLatency?: CheckoutShippingLatencyInputV1 | null;
  segments?: CheckoutSegmentInputV1[] | null;
  sourceTruth?: Partial<Record<"META" | "GA4" | "FUNNELKIT" | "WOO", EvidenceTruthState>> | null;
  freshness?: {
    asOf?: string | null;
    completeThrough?: string | null;
  } | null;
}

export interface CheckoutStageRowV1 {
  key: CheckoutStageKey;
  label: string;
  currentCount: number | null;
  priorCount: number | null;
  currentStepConversion: number | null;
  priorStepConversion: number | null;
  conversionDeltaPoints: number | null;
}

export interface CheckoutLargestDropoffV1 {
  from: CheckoutStageKey;
  to: CheckoutStageKey;
  fromLabel: string;
  toLabel: string;
  lostCount: number;
  dropoffRate: number;
}

export interface CheckoutSegmentViewV1 {
  device: string;
  source: string;
  checkoutLoaded: number | null;
  purchases: number | null;
  conversion: number | null;
}

export interface CheckoutShippingLatencyViewV1 {
  sampleSize: number | null;
  waitsAtLeastFourSeconds: number | null;
  slowWaitShare: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  mobileChromeSampleSize: number | null;
  mobileChromeMedianMs: number | null;
  mobileChromeP95Ms: number | null;
  buckets: Array<{ label: string; count: number | null }>;
  materialAlert: boolean;
}

export interface CheckoutRecommendationV1 {
  kind: "DATA_QUALITY" | "FRICTION_INVESTIGATION" | "ERROR_INVESTIGATION";
  summary: string;
  rationale: string;
  requiresApproval: true;
  externalMutationAllowed: false;
}

export interface CheckoutDiagnosticsViewModelV1 {
  state: CheckoutDiagnosticsState;
  stateLabel: string;
  currentRange: CheckoutDateRangeV1;
  priorRange: CheckoutDateRangeV1;
  stageRows: CheckoutStageRowV1[];
  largestDropoff: CheckoutLargestDropoffV1 | null;
  errors: CheckoutErrorSummary | null;
  shippingLatency: CheckoutShippingLatencyViewV1 | null;
  segments: CheckoutSegmentViewV1[];
  sourceTruth: Record<"META" | "GA4" | "FUNNELKIT" | "WOO", EvidenceTruthState>;
  asOf: string | null;
  completeThrough: string | null;
  decisionGrade: boolean;
  attributionNote: string;
  recommendation: CheckoutRecommendationV1 | null;
}

const SOURCE_KEYS = ["META", "GA4", "FUNNELKIT", "WOO"] as const;

function optionalCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function optionalFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function stageCount(period: CheckoutStagePeriodInputV1 | null | undefined, key: CheckoutStageKey): number | null {
  return optionalCount(period?.stages?.[key]);
}

function hasCompleteStagePeriod(period: CheckoutStagePeriodInputV1 | null | undefined): boolean {
  return CHECKOUT_STAGE_ORDER.every((key) => stageCount(period, key) !== null);
}

function buildStageRows(current: CheckoutStagePeriodInputV1 | null | undefined, prior: CheckoutStagePeriodInputV1 | null | undefined): CheckoutStageRowV1[] {
  return CHECKOUT_STAGE_ORDER.map((key, index) => {
    const currentCount = stageCount(current, key);
    const priorCount = stageCount(prior, key);
    const currentPrevious = index === 0 ? null : stageCount(current, CHECKOUT_STAGE_ORDER[index - 1]);
    const priorPrevious = index === 0 ? null : stageCount(prior, CHECKOUT_STAGE_ORDER[index - 1]);
    const currentStepConversion = index === 0 ? null : ratio(currentCount, currentPrevious);
    const priorStepConversion = index === 0 ? null : ratio(priorCount, priorPrevious);

    return {
      key,
      label: CHECKOUT_STAGE_LABELS[key],
      currentCount,
      priorCount,
      currentStepConversion,
      priorStepConversion,
      conversionDeltaPoints: currentStepConversion === null || priorStepConversion === null
        ? null
        : (currentStepConversion - priorStepConversion) * 100,
    };
  });
}

function findLargestDropoff(rows: CheckoutStageRowV1[]): CheckoutLargestDropoffV1 | null {
  let largest: CheckoutLargestDropoffV1 | null = null;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.currentCount === null || current.currentCount === null || previous.currentCount <= 0) continue;
    const lostCount = Math.max(0, previous.currentCount - current.currentCount);
    const dropoffRate = lostCount / previous.currentCount;
    if (!largest || dropoffRate > largest.dropoffRate) {
      largest = {
        from: previous.key,
        to: current.key,
        fromLabel: previous.label,
        toLabel: current.label,
        lostCount,
        dropoffRate,
      };
    }
  }
  return largest;
}

function buildErrors(input: CheckoutErrorInputV1 | null | undefined): CheckoutErrorSummary | null {
  if (!input) return null;
  const validation = optionalCount(input.validationErrors);
  const payment = optionalCount(input.paymentErrors);
  const ajax = optionalCount(input.checkoutAjaxErrors);
  if (validation === null || payment === null || ajax === null) return null;
  return summarizeCheckoutErrors({
    validationErrors: validation,
    paymentErrors: payment,
    checkoutAjaxErrors: ajax,
  });
}

function buildShippingLatency(input: CheckoutShippingLatencyInputV1 | null | undefined, errors: CheckoutErrorSummary | null): CheckoutShippingLatencyViewV1 | null {
  if (!input) return null;
  const sampleSize = optionalCount(input.sampleSize);
  const slowWaits = optionalCount(input.waitsAtLeastFourSeconds);
  const slowWaitShare = ratio(slowWaits, sampleSize);
  const materialAlert = sampleSize !== null
    && sampleSize >= 10
    && ((slowWaitShare !== null && slowWaitShare >= 0.3) || (errors?.checkout_ajax_errors ?? 0) >= 2);

  return {
    sampleSize,
    waitsAtLeastFourSeconds: slowWaits,
    slowWaitShare,
    medianMs: optionalFiniteNumber(input.medianMs),
    p95Ms: optionalFiniteNumber(input.p95Ms),
    mobileChromeSampleSize: optionalCount(input.mobileChromeSampleSize),
    mobileChromeMedianMs: optionalFiniteNumber(input.mobileChromeMedianMs),
    mobileChromeP95Ms: optionalFiniteNumber(input.mobileChromeP95Ms),
    buckets: (input.buckets ?? []).map((bucket) => ({ label: bucket.label, count: optionalCount(bucket.count) })),
    materialAlert,
  };
}

function buildSegments(inputs: CheckoutSegmentInputV1[] | null | undefined): CheckoutSegmentViewV1[] {
  return (inputs ?? [])
    .map((segment) => {
      const checkoutLoaded = optionalCount(segment.checkoutLoaded);
      const purchases = optionalCount(segment.purchases);
      return {
        device: segment.device?.trim() || "Unknown device",
        source: segment.source?.trim() || "Unknown source",
        checkoutLoaded,
        purchases,
        conversion: ratio(purchases, checkoutLoaded),
      };
    })
    .sort((a, b) => {
      const aMobile = a.device.toLowerCase().includes("mobile") ? 1 : 0;
      const bMobile = b.device.toLowerCase().includes("mobile") ? 1 : 0;
      if (aMobile !== bMobile) return bMobile - aMobile;
      return (b.checkoutLoaded ?? -1) - (a.checkoutLoaded ?? -1);
    });
}

function normalizeSourceTruth(input: CheckoutDiagnosticsInputV1["sourceTruth"]): CheckoutDiagnosticsViewModelV1["sourceTruth"] {
  return Object.fromEntries(SOURCE_KEYS.map((source) => [source, input?.[source] ?? "UNKNOWN"])) as CheckoutDiagnosticsViewModelV1["sourceTruth"];
}

function deriveState(input: CheckoutDiagnosticsInputV1, errors: CheckoutErrorSummary | null, shipping: CheckoutShippingLatencyViewV1 | null, segments: CheckoutSegmentViewV1[], sourceTruth: CheckoutDiagnosticsViewModelV1["sourceTruth"]): CheckoutDiagnosticsState {
  if (input.instrumentation === "INACTIVE") return "WAITING_FOR_INSTRUMENTATION";
  if (input.instrumentation === "UNAVAILABLE") return "UNAVAILABLE";
  if (input.instrumentation === "CONFLICTED" || SOURCE_KEYS.some((source) => sourceTruth[source] === "CONFLICTED")) return "CONFLICTED";

  const stagesComplete = hasCompleteStagePeriod(input.current) && hasCompleteStagePeriod(input.prior);
  const sourcesComplete = SOURCE_KEYS.every((source) => sourceTruth[source] === "COMPLETE");
  const shippingComplete = shipping !== null && shipping.sampleSize !== null && shipping.waitsAtLeastFourSeconds !== null;
  const instrumentationComplete = input.instrumentation === "ACTIVE" && stagesComplete && errors !== null && shippingComplete && segments.length > 0 && sourcesComplete;

  return instrumentationComplete ? "READY" : "PARTIAL";
}

function stateLabel(state: CheckoutDiagnosticsState): string {
  switch (state) {
    case "WAITING_FOR_INSTRUMENTATION": return "Waiting for checkout instrumentation";
    case "PARTIAL": return "Checkout instrumentation is incomplete";
    case "READY": return "Checkout diagnostics ready";
    case "UNAVAILABLE": return "Checkout diagnostics unavailable";
    case "CONFLICTED": return "Checkout evidence is conflicted";
  }
}

function buildRecommendation(state: CheckoutDiagnosticsState, largestDropoff: CheckoutLargestDropoffV1 | null, errors: CheckoutErrorSummary | null, shipping: CheckoutShippingLatencyViewV1 | null): CheckoutRecommendationV1 | null {
  if (state === "PARTIAL") {
    return {
      kind: "DATA_QUALITY",
      summary: "Complete checkout instrumentation before treating observed drop-off as decision-grade.",
      rationale: "One or more required stage, error, segment, latency, or source-truth inputs are missing, stale, partial, or unknown.",
      requiresApproval: true,
      externalMutationAllowed: false,
    };
  }
  if (state !== "READY") return null;

  if (shipping?.materialAlert) {
    return {
      kind: "FRICTION_INVESTIGATION",
      summary: "Investigate shipping-method loading latency before changing checkout behavior.",
      rationale: "The existing materiality threshold is met: sample size is at least 10 and either 4+ second waits affect at least 30% of observations or checkout AJAX errors are at least 2. This is an observed association, not proof of causality.",
      requiresApproval: true,
      externalMutationAllowed: false,
    };
  }

  if (errors && errors.total_errors >= 2) {
    return {
      kind: "ERROR_INVESTIGATION",
      summary: "Review checkout error evidence before proposing a conversion change.",
      rationale: `${errors.total_errors} checkout errors were observed in the selected range. Error telemetry can identify where to investigate but does not by itself establish conversion causality.`,
      requiresApproval: true,
      externalMutationAllowed: false,
    };
  }

  if (largestDropoff && largestDropoff.dropoffRate >= 0.3) {
    return {
      kind: "FRICTION_INVESTIGATION",
      summary: `Investigate the observed ${largestDropoff.fromLabel} → ${largestDropoff.toLabel} drop-off.`,
      rationale: `The largest adjacent-stage drop-off is ${(largestDropoff.dropoffRate * 100).toFixed(1)}%. Treat it as a prioritization signal, not a causal diagnosis, until supporting behavioral evidence is reviewed.`,
      requiresApproval: true,
      externalMutationAllowed: false,
    };
  }

  return null;
}

export function buildCheckoutDiagnosticsViewModelV1(input: CheckoutDiagnosticsInputV1): CheckoutDiagnosticsViewModelV1 {
  const stageRows = buildStageRows(input.current, input.prior);
  const errors = buildErrors(input.errors);
  const shippingLatency = buildShippingLatency(input.shippingLatency, errors);
  const segments = buildSegments(input.segments);
  const sourceTruth = normalizeSourceTruth(input.sourceTruth);
  const state = deriveState(input, errors, shippingLatency, segments, sourceTruth);
  const largestDropoff = findLargestDropoff(stageRows);

  return {
    state,
    stateLabel: stateLabel(state),
    currentRange: input.range.current,
    priorRange: input.range.prior,
    stageRows,
    largestDropoff,
    errors,
    shippingLatency,
    segments,
    sourceTruth,
    asOf: input.freshness?.asOf ?? null,
    completeThrough: input.freshness?.completeThrough ?? null,
    decisionGrade: state === "READY",
    attributionNote: "Meta, GA4, FunnelKit, and Woo evidence may be reconciled for timing and segment context, but observed checkout friction is not causal attribution. Missing, partial, stale, or conflicted evidence must remain explicit.",
    recommendation: buildRecommendation(state, largestDropoff, errors, shippingLatency),
  };
}

/**
 * Checkout Diagnostics View Model
 *
 * Pure, deterministic view model that transforms checkout diagnostic inputs
 * into an evidence-honest funnel summary for the INTELLIGENCE_UX stream.
 *
 * @fileoverview Evidence-honest conversion funnel computation with no data fabrication.
 */

/**
 * Ordered sequence of checkout funnel steps.
 * Must be preserved exactly as specified in the acceptance criteria.
 */
const CHECKOUT_FUNNEL_SEQUENCE = [
  "checkout",                    // checkout loaded
  "customer_info_start",         // customer info started
  "customer_info_complete",      // customer info completed
  "shipping_methods_loaded",     // shipping methods loaded
  "shipping_selected",           // shipping method selected
  "shipping_total_shown",        // shipping total shown
  "payment_section_visible",     // payment section visible
  "payment_methods_loaded",      // payment methods loaded
  "payment_selected",            // payment method selected
  "place_order_clicked",         // place order clicked
  "order_created",               // order created
  "purchase"                     // purchase completed
] as const;

/**
 * Minimum sample size required to consider recommendation thresholds eligible.
 */
const MIN_RECOMMENDATION_SAMPLE = 10;

/**
 * Valid checkout funnel states for evidence-honest reporting.
 */
type FunnelConversionState = 
  | "NO_DATA"                    // No instrumentation available at all
  | "WAITING_FOR_INSTRUMENTATION" // Some steps missing data
  | "PARTIAL"                    // Partial data with gaps
  | "ACTIVE";                     // All steps have valid data

/**
 * Funnel step counts (current period or matched prior).
 */
type FunnelStepCounts = Record<string, number | null>;

/**
 * Converts a raw funnel count to its recommendation eligibility status.
 */
function convertCountToEligibility(count: number | null): boolean {
  if (count == null) {
    return false;
  }
  if (!Number.isFinite(count)) {
    return false;
  }
  if (count < MIN_RECOMMENDATION_SAMPLE) {
    return false;
  }
  return true;
}

/**
 * Validates that a count is non-negative and finite.
 */
function isValidCount(count: number | null): boolean {
  return typeof count === "number" && Number.isFinite(count) && count >= 0;
}

/**
 * Safely computes a conversion rate between two adjacent funnel steps.
 * Returns null when inputs are invalid or denominator is not positive.
 */
function computeConversion(
  fromStep: string,
  toStep: string,
  fromCount: number | null,
  toCount: number | null
): number | null {
  if (!isValidCount(fromCount) || !isValidCount(toCount)) {
    return null;
  }

  if (toCount <= 0) {
    return null;
  }

  const rate = fromCount / toCount;

  if (!Number.isFinite(rate) || rate < 0 || rate > Number.MAX_SAFE_INTEGER) {
    return null;
  }

  return rate;
}

/**
 * Safely computes a drop-off between two adjacent funnel steps.
 * Returns null when inputs are invalid.
 */
function computeDropOff(
  fromStep: string,
  toStep: string,
  fromCount: number | null,
  toCount: number | null
): number | null {
  if (!isValidCount(fromCount) || !isValidCount(toCount)) {
    return null;
  }

  const dropOff = fromCount - toCount;

  if (!Number.isFinite(dropOff)) {
    return null;
  }

  return dropOff;
}

/**
 * Computes all conversion rates for adjacent funnel steps.
 */
function computeAllConversions(
  counts: FunnelStepCounts,
  sequence: readonly string[]
): Record<string, number | null> {
  const conversions: Record<string, number | null> = {};

  for (let i = 0; i < sequence.length - 1; i++) {
    const fromStep = sequence[i];
    const toStep = sequence[i + 1];
    const key = `${fromStep} → ${toStep}`;

    conversions[key] = computeConversion(fromStep, toStep, counts[fromStep], counts[toStep]);
  }

  return conversions;
}

/**
 * Computes all drop-offs for adjacent funnel steps.
 */
function computeAllDropOffs(
  counts: FunnelStepCounts,
  sequence: readonly string[]
): Record<string, number | null> {
  const dropOffs: Record<string, number | null> = {};

  for (let i = 0; i < sequence.length - 1; i++) {
    const fromStep = sequence[i];
    const toStep = sequence[i + 1];
    const key = `${fromStep} → ${toStep}`;

    dropOffs[key] = computeDropOff(fromStep, toStep, counts[fromStep], counts[toStep]);
  }

  return dropOffs;
}

/**
 * Identifies the largest positive drop-off in the funnel.
 */
function findLargestDropOff(dropOffs: Record<string, number | null>): { step: string; value: number } | null {
  let maxDropOff: number | null = null;
  let largestStep: string | null = null;

  for (const [step, dropOff] of Object.entries(dropOffs)) {
    if (dropOff == null || dropOff <= 0) {
      continue;
    }

    if (maxDropOff === null || dropOff > maxDropOff) {
      maxDropOff = dropOff;
      largestStep = step;
    }
  }

  return largestStep != null ? { step: largestStep, value: maxDropOff! } : null;
}

/**
 * Builds the complete funnel summary from raw step counts.
 */
function computeFunnel(
  currentPeriod: number | null,
  matchedPrior: FunnelStepCounts | null
): {
  state: FunnelConversionState;
  conversions: Record<string, number | null>;
  dropOffs: Record<string, number | null>;
  largestDropOff: { step: string; value: number } | null;
  recommendationThresholds: Record<string, boolean>;
} {
  // If no current period data, return NO_DATA state
  if (currentPeriod == null || !isValidCount(currentPeriod)) {
    return {
      state: "NO_DATA" as FunnelConversionState,
      conversions: {},
      dropOffs: {},
      largestDropOff: null,
      recommendationThresholds: {},
    };
  }

  // Build counts for current period
  const counts: FunnelStepCounts = {};
  
  if (currentPeriod != null) {
    counts["checkout"] = currentPeriod;
  }

  // If matched prior is provided, use it to fill in gaps
  if (matchedPrior && typeof matchedPrior === "object" && matchedPrior !== null) {
    for (const step of CHECKOUT_FUNNEL_SEQUENCE) {
      if (counts[step] == null && matchedPrior[step] != null) {
        counts[step] = matchedPrior[step];
      }
    }
  }

  // Compute conversions and drop-offs
  const dropOffs = computeAllDropOffs(counts, CHECKOUT_FUNNEL_SEQUENCE);
  const conversions = computeAllConversions(counts, CHECKOUT_FUNNEL_SEQUENCE);
  
  // Find largest drop-off
  const largest = findLargestDropOff(dropOffs);

  // Build recommendation thresholds for all steps
  const recommendationThresholds: Record<string, boolean> = {};
  for (const step of CHECKOUT_FUNNEL_SEQUENCE) {
    recommendationThresholds[step] = convertCountToEligibility(counts[step]);
  }

  // Determine state based on what we have
  const validCounts = Object.values(counts).filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c) && c >= 0
  ) as number[];
  
  const missingSteps = CHECKOUT_FUNNEL_SEQUENCE.filter((step) => counts[step] == null);
  const waitingCount = missingSteps.length;

  if (waitingCount > 0) {
    // If there are missing steps but we have some data, decide between PARTIAL and WAITING_FOR_INSTRUMENTATION
    if (validCounts.length > 0) {
      return {
        state: "WAITING_FOR_INSTRUMENTATION" as FunnelConversionState,
        conversions,
        dropOffs,
        largestDropOff,
        recommendationThresholds,
      };
    }
    
    // No valid counts at all with missing steps = NO_DATA
    return {
      state: "NO_DATA" as FunnelConversionState,
      conversions,
      dropOffs,
      largestDropOff,
      recommendationThresholds,
    };
  }

  // All steps have data - check if we have gaps (non-null vs null values)
  const hasNulls = Object.values(counts).includes(null);
  
  if (!hasNulls && validCounts.length === CHECKOUT_FUNNEL_SEQUENCE.length) {
    // All steps present with valid counts
    return {
      state: "ACTIVE" as FunnelConversionState,
      conversions,
      dropOffs,
      largestDropOff,
      recommendationThresholds,
    };
  }

  // We have some data but not complete or there are nulls = PARTIAL
  if (validCounts.length > 0) {
    return {
      state: "PARTIAL" as FunnelConversionState,
      conversions,
      dropOffs,
      largestDropOff,
      recommendationThresholds,
    };
  }

  // No valid counts at all = NO_DATA
  return {
    state: "NO_DATA" as FunnelConversionState,
    conversions,
    dropOffs,
    largestDropOff,
    recommendationThresholds,
  };
}

/**
 * Main entry point for computing the evidence-honest funnel view model.
 */
export function checkoutFunnelViewModel(
  currentPeriod: number | null,
  matchedPrior: FunnelStepCounts | null
): {
  state: FunnelConversionState;
  conversions: Record<string, number | null>;
  dropOffs: Record<string, number | null>;
  largestDropOff: { step: string; value: number } | null;
  recommendationThresholds: Record<string, boolean>;
} {
  return computeFunnel(currentPeriod, matchedPrior);
}

export default checkoutFunnelViewModel;

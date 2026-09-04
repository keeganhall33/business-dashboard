/**
 * Checkout Error Summary Helper
 * Determines the dominant error class from checkout diagnostic data.
 */

export type CheckoutErrorClass = "VALIDATION" | "PAYMENT" | "AJAX" | "TIE" | "NONE";

interface CountInput {
  validation?: number;
  payment?: number;
  ajax?: number;
}

/**
 * Summarize checkout errors from raw input.
 * Normalizes invalid values to 0, computes total, determines dominant class.
 * A valid count is a finite nonnegative integer. Invalid values normalize to 0.
 */
export function summarizeCheckoutErrors(input: CountInput | undefined): CheckoutErrorClass {
  // Handle undefined input gracefully
  if (typeof input === "undefined") {
    return "NONE";
  }

  // Normalize counts - treat undefined and non-finite as 0
  const validation =
    typeof input.validation === "number" && Number.isFinite(input.validation) && input.validation >= 0
      ? Math.floor(input.validation)
      : 0;

  const payment =
    typeof input.payment === "number" && Number.isFinite(input.payment) && input.payment >= 0
      ? Math.floor(input.payment)
      : 0;

  const ajax =
    typeof input.ajax === "number" && Number.isFinite(input.ajax) && input.ajax >= 0
      ? Math.floor(input.ajax)
      : 0;

  // Calculate total (all counts are now nonnegative integers)
  const total = validation + payment + ajax;

  if (total === 0) {
    return "NONE";
  }

  // Find dominant class(es) among normalized counts
  const maxCount = Math.max(validation, payment, ajax);

  const dominatingClasses: CheckoutErrorClass[] = [];
  if (validation === maxCount && validation > 0) dominatingClasses.push("VALIDATION");
  if (payment === maxCount && payment > 0) dominatingClasses.push("PAYMENT");
  if (ajax === maxCount && ajax > 0) dominatingClasses.push("AJAX");

  // If only one class has the maximum positive count, it's dominant
  if (dominatingClasses.length === 1) {
    return dominatingClasses[0];
  }

  // Multiple classes tied at max - return TIE
  return "TIE";
}
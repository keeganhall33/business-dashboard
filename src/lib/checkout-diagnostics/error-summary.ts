/**
 * Summarizes checkout validation, payment, and AJAX error counts.
 * Normalizes inputs to nonnegative integers and produces a classification.
 */

/** Normalize input to a nonnegative integer; invalid values become 0. */
function normalizeErrorCount(value: unknown): number {
  if (value === null || typeof value !== "number") return 0
  const normalized = Number.isFinite(value) ? Math.trunc(Number(value)) : 0
  return normalized < 0 ? 0 : normalized
}

/** Determines the dominant error class from normalized counts. */
function determineDominantClass(
  validation: number,
  payment: number,
  ajax: number
): "VALIDATION" | "PAYMENT" | "AJAX" | "TIE" | "NONE" {
  const errors = [
    { class: "VALIDATION", count: validation },
    { class: "PAYMENT", count: payment },
    { class: "AJAX", count: ajax },
  ]
  const total = validation + payment + ajax
  if (total === 0) return "NONE"

  // Get counts with their classes, filter out zeros
  const nonzero = errors.filter(e => e.count > 0)
  if (nonzero.length === 0) return "NONE"

  const maxCount = Math.max(nonzero[0].count, nonzero[1]?.count ?? 0, nonzero[2]?.count ?? 0)
  const dominantClasses = nonzero.filter(e => e.count === maxCount).map(e => e.class)
  if (dominantClasses.length > 1) return "TIE"
  return dominantClasses[0] as "VALIDATION" | "PAYMENT" | "AJAX"
}

/**
 * Summary of checkout errors with normalization and classification.
 */
export function summarizeCheckoutErrors(input: {
  validationErrors: unknown
  paymentErrors: unknown
  checkoutAjaxErrors: unknown
}): {
  validation_errors: number
  payment_errors: number
  checkout_ajax_errors: number
  total_errors: number
  has_errors: boolean
  dominant_error_class: "VALIDATION" | "PAYMENT" | "AJAX" | "TIE" | "NONE"
} {
  const validation = normalizeErrorCount(input.validationErrors)
  const payment = normalizeErrorCount(input.paymentErrors)
  const ajax = normalizeErrorCount(input.checkoutAjaxErrors)

  const total = validation + payment + ajax
  const hasErrors = total > 0
  const dominantClass = determineDominantClass(validation, payment, ajax)

  return {
    validation_errors: validation,
    payment_errors: payment,
    checkout_ajax_errors: ajax,
    total_errors: total,
    has_errors: hasErrors,
    dominant_error_class: dominantClass,
  }
}

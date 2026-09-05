export type CheckoutErrorClass = "VALIDATION" | "PAYMENT" | "AJAX" | "TIE" | "NONE";

export interface CheckoutErrorSummary {
  validation_errors: number;
  payment_errors: number;
  checkout_ajax_errors: number;
  total_errors: number;
  has_errors: boolean;
  dominant_error_class: CheckoutErrorClass;
}

type CheckoutErrorInput = {
  validationErrors?: unknown;
  paymentErrors?: unknown;
  checkoutAjaxErrors?: unknown;
};

function normalizeCount(value: unknown): number {
  return typeof value === "number"
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    ? value
    : 0;
}

export function summarizeCheckoutErrors(input: CheckoutErrorInput = {}): CheckoutErrorSummary {
  const validation = normalizeCount(input.validationErrors);
  const payment = normalizeCount(input.paymentErrors);
  const ajax = normalizeCount(input.checkoutAjaxErrors);
  const total = validation + payment + ajax;

  let dominant: CheckoutErrorClass = "NONE";
  if (total > 0) {
    const max = Math.max(validation, payment, ajax);
    const leaders = [validation === max, payment === max, ajax === max].filter(Boolean).length;
    dominant = leaders > 1
      ? "TIE"
      : validation === max
        ? "VALIDATION"
        : payment === max
          ? "PAYMENT"
          : "AJAX";
  }

  return {
    validation_errors: validation,
    payment_errors: payment,
    checkout_ajax_errors: ajax,
    total_errors: total,
    has_errors: total > 0,
    dominant_error_class: dominant,
  };
}

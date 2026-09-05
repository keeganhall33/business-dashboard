import test from "node:test";
import assert from "node:assert/strict";

import { summarizeCheckoutErrors } from "../../src/lib/checkout-diagnostics/error-summary.ts";

test("normalizes invalid counts and preserves valid integers", () => {
  assert.deepEqual(
    summarizeCheckoutErrors({ validationErrors: 4.7, paymentErrors: -1, checkoutAjaxErrors: 3 }),
    {
      validation_errors: 0,
      payment_errors: 0,
      checkout_ajax_errors: 3,
      total_errors: 3,
      has_errors: true,
      dominant_error_class: "AJAX",
    },
  );

  for (const invalid of [2.9, 1.3, NaN, Infinity, -Infinity, "5", null, undefined]) {
    assert.equal(summarizeCheckoutErrors({ validationErrors: invalid }).validation_errors, 0);
  }
});

test("returns NONE for zero total", () => {
  assert.deepEqual(summarizeCheckoutErrors({}), {
    validation_errors: 0,
    payment_errors: 0,
    checkout_ajax_errors: 0,
    total_errors: 0,
    has_errors: false,
    dominant_error_class: "NONE",
  });
});

test("selects each unique dominant class", () => {
  assert.equal(
    summarizeCheckoutErrors({ validationErrors: 5, paymentErrors: 2, checkoutAjaxErrors: 1 }).dominant_error_class,
    "VALIDATION",
  );
  assert.equal(
    summarizeCheckoutErrors({ validationErrors: 1, paymentErrors: 5, checkoutAjaxErrors: 2 }).dominant_error_class,
    "PAYMENT",
  );
  assert.equal(
    summarizeCheckoutErrors({ validationErrors: 1, paymentErrors: 2, checkoutAjaxErrors: 5 }).dominant_error_class,
    "AJAX",
  );
});

test("returns TIE for equal largest nonzero classes", () => {
  assert.equal(
    summarizeCheckoutErrors({ validationErrors: 4, paymentErrors: 4, checkoutAjaxErrors: 1 }).dominant_error_class,
    "TIE",
  );
  assert.equal(
    summarizeCheckoutErrors({ validationErrors: 3, paymentErrors: 3, checkoutAjaxErrors: 3 }).dominant_error_class,
    "TIE",
  );
});

test("computes totals and has_errors from normalized counts", () => {
  const value = summarizeCheckoutErrors({
    validationErrors: 7,
    paymentErrors: 2,
    checkoutAjaxErrors: 1,
  });

  assert.equal(value.validation_errors, 7);
  assert.equal(value.payment_errors, 2);
  assert.equal(value.checkout_ajax_errors, 1);
  assert.equal(value.total_errors, 10);
  assert.equal(value.has_errors, true);
});

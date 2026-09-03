import assert from "node:assert/strict"
import test from "node:test"
import { summarizeCheckoutErrors } from "../../src/lib/checkout-diagnostics/error-summary.js"

const expectAllZero = (r) => {
  assert.strictEqual(r.validation_errors, 0, "validation")
  assert.strictEqual(r.payment_errors, 0, "payment")
  assert.strictEqual(r.checkout_ajax_errors, 0, "ajax")
  assert.strictEqual(r.total_errors, 0, "total")
  assert.strictEqual(r.has_errors, false, "has_errors")
  assert.strictEqual(r.dominant_error_class, "NONE", "dominant")
}

test("all zeros returns NONE", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 0 })) })
test("VALIDATION only dominant", () => { const r = summarizeCheckoutErrors({ validationErrors: 5, paymentErrors: 0, checkoutAjaxErrors: 0 }); assert.strictEqual(r.dominant_error_class, "VALIDATION") })
test("PAYMENT only dominant", () => { const r = summarizeCheckoutErrors({ validationErrors: 0, paymentErrors: 3, checkoutAjaxErrors: 0 }); assert.strictEqual(r.dominant_error_class, "PAYMENT") })
test("AJAX only dominant", () => { const r = summarizeCheckoutErrors({ validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 2 }); assert.strictEqual(r.dominant_error_class, "AJAX") })
test("two-way tie returns TIE", () => { const r = summarizeCheckoutErrors({ validationErrors: 4, paymentErrors: 4, checkoutAjaxErrors: 0 }); assert.strictEqual(r.total_errors, 8); assert.strictEqual(r.has_errors, true); assert.strictEqual(r.dominant_error_class, "TIE") })
test("three-way tie returns TIE", () => { const r = summarizeCheckoutErrors({ validationErrors: 2, paymentErrors: 2, checkoutAjaxErrors: 2 }); assert.strictEqual(r.dominant_error_class, "TIE") })
test("null values normalize to 0", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: null, paymentErrors: null, checkoutAjaxErrors: null })) })
test("negative values normalize to 0", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: -5, paymentErrors: -3, checkoutAjaxErrors: -2 })) })
test("NaN values normalize to 0", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: NaN, paymentErrors: NaN, checkoutAjaxErrors: NaN })) })
test("Infinity values normalize to 0", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: Infinity, paymentErrors: -Infinity, checkoutAjaxErrors: NaN })) })
test("string values normalize to 0", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: "error", paymentErrors: "invalid", checkoutAjaxErrors: "fail" })) })
test("fractional values truncate", () => { const r = summarizeCheckoutErrors({ validationErrors: 4.7, paymentErrors: 2.9, checkoutAjaxErrors: 1.3 }); assert.strictEqual(r.validation_errors, 4); assert.strictEqual(r.payment_errors, 2); assert.strictEqual(r.checkout_ajax_errors, 1) })
test("mixed valid and invalid", () => { const r = summarizeCheckoutErrors({ validationErrors: null, paymentErrors: 5, checkoutAjaxErrors: -3 }); assert.strictEqual(r.validation_errors, 0); assert.strictEqual(r.payment_errors, 5); assert.strictEqual(r.checkout_ajax_errors, 0) })
test("large values work", () => { const r = summarizeCheckoutErrors({ validationErrors: 1000, paymentErrors: 500, checkoutAjaxErrors: 250 }); assert.strictEqual(r.total_errors, 1750); assert.strictEqual(r.dominant_error_class, "VALIDATION") })
test("fractional negative", () => { const r = summarizeCheckoutErrors({ validationErrors: -4.7, paymentErrors: -2.9, checkoutAjaxErrors: 3.1 }); assert.strictEqual(r.validation_errors, 0); assert.strictEqual(r.payment_errors, 0); assert.strictEqual(r.checkout_ajax_errors, 3) })
test("undefined values", () => { expectAllZero(summarizeCheckoutErrors({ validationErrors: undefined, paymentErrors: undefined, checkoutAjaxErrors: undefined })) })
test("has_errors flag correct", () => { const r1 = summarizeCheckoutErrors({ validationErrors: 0, paymentErrors: 0, checkoutAjaxErrors: 0 }); assert.strictEqual(r1.has_errors, false); const r2 = summarizeCheckoutErrors({ validationErrors: 1, paymentErrors: 0, checkoutAjaxErrors: 0 }); assert.strictEqual(r2.has_errors, true) })
test("AJAX dominates with others present", () => { const r = summarizeCheckoutErrors({ validationErrors: 1, paymentErrors: 2, checkoutAjaxErrors: 5 }); assert.strictEqual(r.dominant_error_class, "AJAX") })
test("fractional inputs determine dominance", () => { const r = summarizeCheckoutErrors({ validationErrors: 4.9, paymentErrors: 5.1, checkoutAjaxErrors: 5.0 }); assert.strictEqual(r.validation_errors, 4); assert.strictEqual(r.payment_errors, 5); assert.strictEqual(r.checkout_ajax_errors, 5); assert.strictEqual(r.dominant_error_class, "TIE") })
test("PAYMENT dominates", () => { const r = summarizeCheckoutErrors({ validationErrors: 0, paymentErrors: 10, checkoutAjaxErrors: 3 }); assert.strictEqual(r.dominant_error_class, "PAYMENT") })

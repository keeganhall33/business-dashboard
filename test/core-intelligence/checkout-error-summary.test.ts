import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeCheckoutErrors } from "@/lib/checkout-diagnostics/error-summary";

describe("summarizeCheckoutErrors", () => {
  it("returns NONE for all-zero counts", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 0, payment: 0, ajax: 0 }), "NONE");
  });

  it("returns NONE when input is empty object", () => {
    assert.strictEqual(summarizeCheckoutErrors({}), "NONE");
  });

  it("returns VALIDATION when only validation count exists", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 5 }), "VALIDATION");
  });

  it("returns PAYMENT when only payment count exists", () => {
    assert.strictEqual(summarizeCheckoutErrors({ payment: 3 }), "PAYMENT");
  });

  it("returns AJAX when only ajax count exists", () => {
    assert.strictEqual(summarizeCheckoutErrors({ ajax: 2 }), "AJAX");
  });

  it("returns dominant class when one count exceeds others", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 10, payment: 3, ajax: 2 }), "VALIDATION");
  });

  it("returns TIE when two classes have equal highest counts", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 5, payment: 5, ajax: 2 }), "TIE");
  });

  it("returns TIE when all three classes are equal", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 3, payment: 3, ajax: 3 }), "TIE");
  });

  it("returns dominant class with fractional counts rounded down", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 4.9, payment: 1 }), "VALIDATION");
  });

  it("returns NONE for negative counts", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: -5, payment: -2, ajax: 0 }), "NONE");
  });

  it("treats NaN as 0 and returns appropriate dominant class", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: NaN, payment: 3, ajax: 1 }), "PAYMENT");
  });

  it("treats Infinity as 0 in sum calculation", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: Infinity, payment: 5, ajax: 2 }), "PAYMENT");
  });

  it("handles null counts gracefully", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: null, payment: 4 }), "PAYMENT");
  });

  it("returns NONE for undefined input", () => {
    assert.strictEqual(summarizeCheckoutErrors(undefined as any), "NONE");
  });

  it("treats string inputs as 0", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: "abc", payment: 2 }), "PAYMENT");
  });

  it("returns TIE for equal non-zero counts of multiple classes", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 100, payment: 50, ajax: 100 }), "TIE");
  });

  it("handles mixed zero and positive with single dominant", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 7, payment: 0, ajax: 0 }), "VALIDATION");
  });

  it("rounds down fractional to determine counts for comparison", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 1.1, payment: 1.5, ajax: 1.9 }), "TIE");
  });

  it("returns NONE for all NaN values", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: NaN, payment: NaN, ajax: NaN }), "NONE");
  });

  it("handles very large numbers correctly", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: 1e15, payment: 1e14, ajax: 1e13 }), "VALIDATION");
  });

  it("returns NONE when total after normalization is zero", () => {
    assert.strictEqual(summarizeCheckoutErrors({ validation: -1, payment: 1, ajax: 0 }), "PAYMENT");
  });
});
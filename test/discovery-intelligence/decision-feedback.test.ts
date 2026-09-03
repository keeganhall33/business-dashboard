import assert from "node:assert"
import { test } from "node:test"
import { normalizeDecisionFeedback } from "../../src/lib/outcome-learning/decision-feedback"

test("normalizeDecisionFeedback exists", () => {
  assert.strictEqual(typeof normalizeDecisionFeedback, "function")
})

test("ACCEPTED disposition with PREFERENCE reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "preference" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "PREFERENCE")
  assert.strictEqual(result.valid, true)
})

test("REJECTED disposition with FEASIBILITY reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "rejected", reason: "feasibility" })
  assert.strictEqual(result.disposition, "REJECTED")
  assert.strictEqual(result.reason, "FEASIBILITY")
  assert.strictEqual(result.valid, true)
})

test("DEFERRED disposition with TIMING reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "deferred", reason: "timing" })
  assert.strictEqual(result.disposition, "DEFERRED")
  assert.strictEqual(result.reason, "TIMING")
  assert.strictEqual(result.valid, true)
})

test("ACCEPTED with OTHER reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "other" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "OTHER")
  assert.strictEqual(result.valid, true)
})

test("EVIDENCE_DISAGREEMENT reason works", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "evidence disagreement" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "EVIDENCE DISAGREEMENT")
  assert.strictEqual(result.valid, true)
})

test("Trims and normalizes case for disposition", () => {
  const result = normalizeDecisionFeedback({ disposition: "  Rejected  ", reason: "Feasibility" })
  assert.strictEqual(result.disposition, "REJECTED")
  assert.strictEqual(result.reason, "FEASIBILITY")
  assert.strictEqual(result.valid, true)
})

test("Trims and normalizes case for reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "   preference   " })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "PREFERENCE")
  assert.strictEqual(result.valid, true)
})

test("Unknown disposition forces unknown reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "maybe", reason: "preference" })
  assert.strictEqual(result.disposition, "UNKNOWN")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Missing disposition defaults to unknown", () => {
  const result = normalizeDecisionFeedback({ reason: "preference" })
  assert.strictEqual(result.disposition, "UNKNOWN")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Non-string disposition becomes unknown", () => {
  const result = normalizeDecisionFeedback({ disposition: null as any, reason: "preference" })
  assert.strictEqual(result.disposition, "UNKNOWN")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Non-string reason becomes unknown", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: null as any })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Empty string reason becomes unknown", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Whitespace-only reason becomes unknown", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "   " })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Unknown disposition with valid reason still forces unknown reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "unknown", reason: "preference" })
  assert.strictEqual(result.disposition, "UNKNOWN")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Valid disposition with unknown reason stays unknown reason", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "unknown" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Unrecognized reason defaults to unknown", () => {
  const result = normalizeDecisionFeedback({ disposition: "accepted", reason: "sentiment" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "UNKNOWN")
  assert.strictEqual(result.valid, false)
})

test("Valid truth table for all dispositions", () => {
  const testCases = [
    { disposition: "accepted", reason: "preference", expectedDisposition: "ACCEPTED", expectedReason: "PREFERENCE", expectedValid: true },
    { disposition: "rejected", reason: "feasibility", expectedDisposition: "REJECTED", expectedReason: "FEASIBILITY", expectedValid: true },
    { disposition: "deferred", reason: "timing", expectedDisposition: "DEFERRED", expectedReason: "TIMING", expectedValid: true },
    { disposition: "accepted", reason: "evidence disagreement", expectedDisposition: "ACCEPTED", expectedReason: "EVIDENCE DISAGREEMENT", expectedValid: true },
    { disposition: "accepted", reason: "other", expectedDisposition: "ACCEPTED", expectedReason: "OTHER", expectedValid: true },
  ]

  for (const tc of testCases) {
    const result = normalizeDecisionFeedback({ disposition: tc.disposition, reason: tc.reason })
    assert.strictEqual(result.disposition, tc.expectedDisposition, `Expected ${tc.expectedDisposition}, got ${result.disposition} for input ${tc.disposition}`)
    assert.strictEqual(result.reason, tc.expectedReason, `Expected ${tc.expectedReason}, got ${result.reason} for input ${tc.reason}`)
    assert.strictEqual(result.valid, tc.expectedValid, `Expected valid=${tc.expectedValid}, got ${result.valid}`)
  }
})

test("All reason types work with accepted disposition", () => {
  const reasons = ["PREFERENCE", "FEASIBILITY", "TIMING", "EVIDENCE DISAGREEMENT", "OTHER"]
  for (const reason of reasons) {
    const result = normalizeDecisionFeedback({ disposition: "accepted", reason: reason })
    assert.strictEqual(result.reason, reason as any, `Failed for reason ${reason}`)
    assert.strictEqual(result.valid, true, `Invalid for valid reason ${reason}`)
  }
})

test("Case insensitivity for reasons", () => {
  const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "Preference" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "PREFERENCE")
  assert.strictEqual(result.valid, true)
})

test("Case insensitivity for dispositions", () => {
  const result = normalizeDecisionFeedback({ disposition: "AcceptEd", reason: "FeasibiLiTy" })
  assert.strictEqual(result.disposition, "ACCEPTED")
  assert.strictEqual(result.reason, "FEASIBILITY")
  assert.strictEqual(result.valid, true)
})

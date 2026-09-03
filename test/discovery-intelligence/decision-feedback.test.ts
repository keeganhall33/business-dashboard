import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { normalizeDecisionFeedback } from "../../src/lib/outcome-learning/decision-feedback.js"

describe("normalizeDecisionFeedback", () => {
  it("string trim uppercase disposition", () => {
    const r = normalizeDecisionFeedback({ disposition: "  ACCEPTED  ", reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "PREFERENCE", valid: true })
  })

  it("string trim uppercase reason", () => {
    const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "  feAsibiLiTy  " })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "FEASIBILITY", valid: true })
  })

  it("underscore preservation", () => {
    const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "EVIDENCE_DISAGREEMENT" })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "EVIDENCE_DISAGREEMENT", valid: true })
  })

  it("space-separated reason rejected as unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "evidence disagreement" })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "UNKNOWN", valid: false })
  })

  it("non-string disposition becomes unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: 123, reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })

  it("non-string reason becomes unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: null })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "UNKNOWN", valid: false })
  })

  it("unknown disposition forces unknown reason and invalid", () => {
    const r = normalizeDecisionFeedback({ disposition: "DEFERRED_X", reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })

  it("regression: invalid disposition preserves valid reason as unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "invalid", reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })

  it("unknown reason with valid disposition is only reason unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "invalid_reason" })
    assert.deepStrictEqual(r, { disposition: "ACCEPTED", reason: "UNKNOWN", valid: false })
  })

  it("all dispositions valid with recognized reason", () => {
    for (const d of ["ACCEPTED", "REJECTED", "DEFERRED"]) {
      const r = normalizeDecisionFeedback({ disposition: d, reason: "PREFERENCE" })
      assert.strictEqual(r.valid, true)
    }
  })

  it("all known reasons preserved", () => {
    const inputs = ["PREFERENCE", "FEASIBILITY", "TIMING", "EVIDENCE_DISAGREEMENT", "OTHER"]
    for (const input of inputs) {
      const r = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: input })
      assert.strictEqual(r.reason, input)
    }
  })

  it("valid truth table", () => {
    const cases = [["ACCEPTED", "PREFERENCE", true], ["REJECTED", "FEASIBILITY", true], ["DEFERRED", "TIMING", true], ["unknown", "UNKNOWN_REASON", false], [123, null, false]]
    for (const [disposition, reason, expectedValid] of cases) {
      const r = normalizeDecisionFeedback({ disposition, reason })
      assert.strictEqual(r.valid, expectedValid)
    }
  })

  it("empty string normalizes to unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "", reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })

  it("whitespace-only normalizes to unknown", () => {
    const r = normalizeDecisionFeedback({ disposition: "   ", reason: "PREFERENCE" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })

  it("unknown with valid disposition only reason invalid", () => {
    for (const combo of [{ d: "ACCEPTED", r: "UNKNOWN_REASON" }, { d: "UNKNOWN", r: "PREFERENCE" }]) {
      const r = normalizeDecisionFeedback({ disposition: combo.d, reason: combo.r })
      assert.strictEqual(r.valid, false)
    }
  })

  it("DEFERRED with null reason has correct disposition and unknown reason", () => {
    const r = normalizeDecisionFeedback({ disposition: "DEFERRED", reason: null })
    assert.deepStrictEqual(r, { disposition: "DEFERRED", reason: "UNKNOWN", valid: false })
  })

  it("unknown disposition with valid reason forces both unknown and invalid", () => {
    const r = normalizeDecisionFeedback({ disposition: "REJECTED_X", reason: "EVIDENCE_DISAGREEMENT" })
    assert.deepStrictEqual(r, { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false })
  })
})

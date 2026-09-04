import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { normalizeDecisionFeedback } from "../../src/lib/outcome-learning/decision-feedback.js"

describe("normalizeDecisionFeedback", () => {
  it("trims and uppercases string tokens", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "  accepted  ", reason: "  feAsibiLiTy  " }),
      { disposition: "ACCEPTED", reason: "FEASIBILITY", valid: true },
    )
  })

  it("preserves the recognized underscore token", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "EVIDENCE_DISAGREEMENT" }),
      { disposition: "ACCEPTED", reason: "EVIDENCE_DISAGREEMENT", valid: true },
    )
  })

  it("does not convert a space-separated reason to underscore form", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "evidence disagreement" }),
      { disposition: "ACCEPTED", reason: "UNKNOWN", valid: false },
    )
  })

  it("non-string disposition forces both fields unknown", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: 123, reason: "PREFERENCE" }),
      { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false },
    )
  })

  it("non-string reason stays unknown with a known disposition", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "DEFERRED", reason: null }),
      { disposition: "DEFERRED", reason: "UNKNOWN", valid: false },
    )
  })

  it("unknown disposition forces a recognized reason back to unknown", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "REJECTED_X", reason: "PREFERENCE" }),
      { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false },
    )
  })

  it("preserves every known disposition and reason token", () => {
    const dispositions = ["ACCEPTED", "REJECTED", "DEFERRED"] as const
    const reasons = ["PREFERENCE", "FEASIBILITY", "TIMING", "EVIDENCE_DISAGREEMENT", "OTHER"] as const
    for (const disposition of dispositions) {
      for (const reason of reasons) {
        assert.deepStrictEqual(
          normalizeDecisionFeedback({ disposition, reason }),
          { disposition, reason, valid: true },
        )
      }
    }
  })

  it("valid is false for an unknown reason with a known disposition", () => {
    assert.deepStrictEqual(
      normalizeDecisionFeedback({ disposition: "REJECTED", reason: "SOMETHING_ELSE" }),
      { disposition: "REJECTED", reason: "UNKNOWN", valid: false },
    )
  })

  it("empty and whitespace-only disposition are unknown", () => {
    for (const disposition of ["", "   ", "\t", "\n"]) {
      assert.deepStrictEqual(
        normalizeDecisionFeedback({ disposition, reason: "TIMING" }),
        { disposition: "UNKNOWN", reason: "UNKNOWN", valid: false },
      )
    }
  })
})

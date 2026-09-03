import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeDecisionFeedback } from "../../src/lib/outcome-learning/decision-feedback.js"

describe("normalizeDecisionFeedback", () => {
  describe("disposition normalization", () => {
    it("ACCEPTED with spaces and lowercase", () => {
      const result = normalizeDecisionFeedback({ disposition: " accepted ", reason: "PREFERENCE" })
      assert.strictEqual(result.disposition, "ACCEPTED")
    })

    it("REJECTED uppercase", () => {
      const result = normalizeDecisionFeedback({ disposition: "REJECTED", reason: "FEASIBILITY" })
      assert.strictEqual(result.disposition, "REJECTED")
    })

    it("DEFERRED mixed case", () => {
      const result = normalizeDecisionFeedback({ disposition: "DeFeRrEd", reason: "TIMING" })
      assert.strictEqual(result.disposition, "DEFERRED")
    })

    it("UNKNOWN non-matching string", () => {
      const result = normalizeDecisionFeedback({ disposition: "invalid", reason: "PREFERENCE" })
      assert.strictEqual(result.disposition, "UNKNOWN")
    })

    it("non-string disposition becomes UNKNOWN", () => {
      const result = normalizeDecisionFeedback({ disposition: 123, reason: "FEASIBILITY" })
      assert.strictEqual(result.disposition, "UNKNOWN")
    })
  })

  describe("reason normalization", () => {
    it("PREFERENCE trimmed lowercase", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: " preference " })
      assert.strictEqual(result.reason, "PREFERENCE")
    })

    it("FEASIBILITY uppercase", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "FEASIBILITY" })
      assert.strictEqual(result.reason, "FEASIBILITY")
    })

    it("TIMING mixed case", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "Timing" })
      assert.strictEqual(result.reason, "TIMING")
    })

    it("EVIDENCE_DISAGREEMENT with spaces around", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: " evidence_disagreement " })
      assert.strictEqual(result.reason, "EVIDENCE_DISAGREEMENT")
    })

    it("OTHER lowercase", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "other" })
      assert.strictEqual(result.reason, "OTHER")
    })

    it("space-separated disagreement is unrecognized", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "evidence disagreement" })
      assert.strictEqual(result.reason, "UNKNOWN")
    })

    it("non-string reason becomes UNKNOWN", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: null as unknown as string } as any)
      assert.strictEqual(result.reason, "UNKNOWN")
    })
  })

  describe("valid truth table", () => {
    it("valid when both known", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "PREFERENCE" })
      assert.strictEqual(result.valid, true)
    })

    it("invalid when disposition unknown", () => {
      const result = normalizeDecisionFeedback({ disposition: "invalid", reason: "PREFERENCE" })
      assert.strictEqual(result.valid, false)
    })

    it("invalid when reason unknown", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "unknown_reason" })
      assert.strictEqual(result.valid, false)
    })

    it("valid with EVIDENCE_DISAGREEMENT", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "EVIDENCE_DISAGREEMENT" })
      assert.strictEqual(result.valid, true)
    })

    it("invalid when both unknown", () => {
      const result = normalizeDecisionFeedback({ disposition: "unknown_disposition", reason: "unknown_reason" })
      assert.strictEqual(result.valid, false)
    })
  })

  describe("exact underscore preservation", () => {
    it("EVIDENCE_DISAGREEMENT preserves underscore", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "evidence_disagreement" })
      assert.strictEqual(result.reason, "EVIDENCE_DISAGREEMENT")
    })

    it("other reasons do not add underscores", () => {
      const result = normalizeDecisionFeedback({ disposition: "ACCEPTED", reason: "preference" })
      assert.strictEqual(result.reason, "PREFERENCE")
    })
  })
})

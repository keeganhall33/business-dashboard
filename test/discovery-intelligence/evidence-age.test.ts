import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { classifyEvidenceAge } from "/Users/keeganhall/.openclaw/workspaces-v4/discovery-evidence-age-classifier-v1-20260903c-1162-local-b-e553acf19043/src/lib/discovery-intelligence/evidence-age.ts"

describe("classifyEvidenceAge", () => {
  const STALE_AFTER = 1000 as unknown as number

  describe("valid inputs", () => {
    describe("fresh cases", () => {
      test("zero age is FRESH", () => {
        const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 1000, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "FRESH")
        assert.strictEqual(result.ageMs, 0)
      })

      test("exact stale boundary is FRESH", () => {
        const result = classifyEvidenceAge({ asOfMs: 2000, observedAtMs: 1000, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "FRESH")
        assert.strictEqual(result.ageMs, 1000)
      })

      test("one millisecond over boundary is STALE", () => {
        const result = classifyEvidenceAge({ asOfMs: 2001, observedAtMs: 1000, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "STALE")
        assert.strictEqual(result.ageMs, 1001)
      })

      test("normal fresh case", () => {
        const result = classifyEvidenceAge({ asOfMs: 5000, observedAtMs: 4999, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "FRESH")
        assert.strictEqual(result.ageMs, 1)
      })

      test("normal stale case", () => {
        const result = classifyEvidenceAge({ asOfMs: 5000, observedAtMs: 3900, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "STALE")
        assert.strictEqual(result.ageMs, 1100)
      })
    })

    describe("future observation", () => {
      test("observedAtMs > asOfMs returns FUTURE with null ageMs", () => {
        const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 2000, staleAfterMs: STALE_AFTER })
        assert.strictEqual(result.state, "FUTURE")
        assert.strictEqual(result.ageMs, null)
      })
    })
  })

  describe("invalid inputs", () => {
    test("staleAfterMs: 0 returns UNAVAILABLE with null ageMs", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: 0 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("staleAfterMs negative returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: -100 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("non-number asOfMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: "invalid" as unknown, observedAtMs: 500, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("fractional asOfMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000.5 as unknown, observedAtMs: 500, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("NaN asOfMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: NaN as unknown, observedAtMs: 500, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("Infinity asOfMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: Infinity as unknown, observedAtMs: 500, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("negative asOfMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: -100 as unknown, observedAtMs: 500, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("non-number observedAtMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: "invalid" as unknown, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("fractional observedAtMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500.5 as unknown, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("negative observedAtMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: -100 as unknown, staleAfterMs: 1000 })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("negative staleAfterMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: -100 as unknown })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("fractional staleAfterMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: 0.5 as unknown })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })

    test("undefined staleAfterMs returns UNAVAILABLE", () => {
      const result = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: undefined as unknown })
      assert.strictEqual(result.state, "UNAVAILABLE")
      assert.strictEqual(result.ageMs, null)
    })
  })
})

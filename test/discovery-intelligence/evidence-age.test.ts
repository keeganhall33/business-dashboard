import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyEvidenceAge } from "../../src/lib/discovery-intelligence/evidence-age"

describe("classifyEvidenceAge", () => {
  it("zero age (fresh)", () => {
    const r = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 1000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "FRESH")
    assert.strictEqual(r.ageMs, 0)
  })

  it("exact stale boundary (ageMs <= staleAfterMs => FRESH)", () => {
    const r = classifyEvidenceAge({ asOfMs: 15000, observedAtMs: 10000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "FRESH")
    assert.strictEqual(r.ageMs, 5000)
  })

  it("one ms over stale", () => {
    const r = classifyEvidenceAge({ asOfMs: 15001, observedAtMs: 10000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "STALE")
    assert.strictEqual(r.ageMs, 5001)
  })

  it("future observation (observedAtMs > asOfMs => FUTURE)", () => {
    const r = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 2000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "FUTURE")
    assert.strictEqual(r.ageMs, null)
  })

  it("zero/negative staleAfterMs => UNAVAILABLE", () => {
    const r = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: 500, staleAfterMs: -5 })
    assert.strictEqual(r.state, "UNAVAILABLE")
    assert.strictEqual(r.ageMs, null)
  })

  it("negative observation time => UNAVAILABLE", () => {
    const r = classifyEvidenceAge({ asOfMs: 1000, observedAtMs: -1000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "UNAVAILABLE")
    assert.strictEqual(r.ageMs, null)
  })

  it("fractional numbers => UNAVAILABLE", () => {
    const r = classifyEvidenceAge({ asOfMs: 1000.5, observedAtMs: 500.2, staleAfterMs: 500 })
    assert.strictEqual(r.state, "UNAVAILABLE")
    assert.strictEqual(r.ageMs, null)
  })

  it("NaN/Infinity => UNAVAILABLE", () => {
    const r = classifyEvidenceAge({ asOfMs: NaN, observedAtMs: Infinity, staleAfterMs: -5 })
    assert.strictEqual(r.state, "UNAVAILABLE")
    assert.strictEqual(r.ageMs, null)
  })

  it("string input => UNAVAILABLE", () => {
    const r = classifyEvidenceAge({ asOfMs: "1000", observedAtMs: "500", staleAfterMs: "5000" })
    assert.strictEqual(r.state, "UNAVAILABLE")
    assert.strictEqual(r.ageMs, null)
  })

  it("normal fresh case (ageMs=1000)", () => {
    const r = classifyEvidenceAge({ asOfMs: 10000, observedAtMs: 9000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "FRESH")
    assert.strictEqual(r.ageMs, 1000)
  })

  it("normal stale case (ageMs=15000)", () => {
    const r = classifyEvidenceAge({ asOfMs: 25000, observedAtMs: 10000, staleAfterMs: 5000 })
    assert.strictEqual(r.state, "STALE")
    assert.strictEqual(r.ageMs, 15000)
  })
})

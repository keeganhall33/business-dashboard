import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOpportunityNaturalKey } from "@/lib/utils/opportunities";

describe("buildOpportunityNaturalKey", () => {
  it("normalizes spacing and casing before hashing", () => {
    const key = buildOpportunityNaturalKey("  Upper   Deck  Hall  of  Fame  capsule ", "UPPER   DECK  ");
    assert.equal(key, "c1bda423cfbc34f92a9c1eccf11abc59264b311d0802b33a36c41ab592b1c8bc");
  });

  it("produces the same hash when organization is missing or blank", () => {
    const keyA = buildOpportunityNaturalKey("Topps", undefined);
    const keyB = buildOpportunityNaturalKey("  TOPPS  ", "   ");
    assert.equal(keyA.length, 64);
    assert.equal(keyA, keyB);
  });
});

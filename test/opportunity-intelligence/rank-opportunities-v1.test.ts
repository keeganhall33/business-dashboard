import assert from "node:assert/strict";
import test from "node:test";

import { rankOpportunitiesForBusinessValueV1 } from "@/lib/opportunity-intelligence/rank-opportunities-v1";

test("active confirmed business outranks speculative prestige research", () => {
  const ranked = rankOpportunitiesForBusinessValueV1([
    { status: "researching", source: "research", prestige_score: 1, updated_at: "2026-09-14T00:00:00Z", name: "Large speculative brand" },
    { status: "in_conversation", source: "KEEGAN_CONFIRMED", prestige_score: 0.2, updated_at: "2026-09-10T00:00:00Z", name: "Active relationship" }
  ], new Date("2026-09-15T00:00:00Z"));

  assert.equal(ranked[0]?.name, "Active relationship");
});

import { describe, expect, it } from "vitest";

import { qualifyGeneralizedClaimsV2 } from "@/lib/external-intelligence/qualification/generalized-claim-qualifier-v2";

describe("generalized claim v2: appointed (SportsPro-only)", () => {
  it("qualifies SportsPro appointment headline pattern A (B's ROLE)", () => {
    const out = qualifyGeneralizedClaimsV2({
      evidence_reference_id: "ev_7acf1d21bdc0dff15d021946",
      source_id: "sports_business.sportspro",
      title: "Ten Toes appointed as Premier Padel's lead digital marketing in multi-year agreement",
      excerpt: null,
      retrieved_at_iso: "2026-08-09T00:00:00.000Z"
    });

    expect(out.status).toBe("qualified");
    expect(out.claims).toHaveLength(1);
    const c = out.claims[0]!;
    expect(c.schema_version).toBe("claim_v2");
    expect(c.predicate).toBe("appointed");
    expect(c.subject?.canonical_name).toBe("Premier Padel");
    if (c.object.kind === "entity") {
      expect(c.object.entity.canonical_name).toBe("Ten Toes");
    }
    expect(c.qualifiers).toEqual([{ key: "appointment_role", value_type: "string", value: "lead digital marketing" }]);
  });

  it("qualifies SportsPro appointment headline pattern B (ROLE for B)", () => {
    const out = qualifyGeneralizedClaimsV2({
      evidence_reference_id: "ev_f1fa565a9fdf8831ec0e7d7b",
      source_id: "sports_business.sportspro",
      title: "Ten Toes appointed as content agency for MI London for the 2026 Hundred Season",
      excerpt: null,
      retrieved_at_iso: "2026-08-09T00:00:00.000Z"
    });

    expect(out.status).toBe("qualified");
    expect(out.claims).toHaveLength(1);
    const c = out.claims[0]!;
    expect(c.subject?.canonical_name).toBe("MI London");
    if (c.object.kind === "entity") {
      expect(c.object.entity.canonical_name).toBe("Ten Toes");
    }
    expect(c.qualifiers).toEqual([{ key: "appointment_role", value_type: "string", value: "content agency" }]);
  });

  it("rejects speculative / near-miss patterns", () => {
    const out = qualifyGeneralizedClaimsV2({
      evidence_reference_id: "ev_x",
      source_id: "sports_business.sportspro",
      title: "Ten Toes could be appointed as content agency for MI London",
      excerpt: null,
      retrieved_at_iso: "2026-08-09T00:00:00.000Z"
    });
    expect(out.status).toBe("not_qualified");
    expect(out.claims).toHaveLength(0);
  });

  it("rejects Boardroom joins-as near miss (should not create appointed)", () => {
    const out = qualifyGeneralizedClaimsV2({
      evidence_reference_id: "ev_br",
      source_id: "sports_business.boardroom",
      title: "Inside Derek Jeter's Bet",
      excerpt: "Derek Jeter joins ALUM as investor, board advisor, and brand ambassador.",
      retrieved_at_iso: "2026-08-09T00:00:00.000Z"
    });
    expect(out.status).toBe("not_qualified");
    expect(out.claims).toHaveLength(0);
  });
});

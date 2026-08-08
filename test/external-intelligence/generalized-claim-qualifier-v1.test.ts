import { describe, expect, it } from "vitest";

import { qualifyGeneralizedClaimsV1 } from "@/lib/external-intelligence/qualification/generalized-claim-qualifier-v1";

describe("generalized claim qualifier v1: partnered_with (precision-first)", () => {
  it("positive: possessive partnership excerpt yields 1 claim with normalized object name", () => {
    const out = qualifyGeneralizedClaimsV1({
      evidence_reference_id: "ev_test",
      source_id: "sports_business.boardroom",
      title: "A24 Built Its Brand on Artists; Now It's Betting on AI",
      excerpt: "<p>A24's $75 million partnership with Google's DeepMind may make business sense.</p>",
      retrieved_at_iso: "2026-08-08T00:00:00.000Z"
    });

    expect(out.status).toBe("qualified");
    expect(out.claims).toHaveLength(1);
    expect(out.diagnostics.supporting_phrases).toHaveLength(1);
    const c = out.claims[0];
    expect(c.predicate).toBe("partnered_with");
    expect(c.subject?.canonical_name).toBe("A24");
    expect(c.object.kind).toBe("entity");
    if (c.object.kind === "entity") {
      expect(c.object.entity.canonical_name).toBe("Google DeepMind");
    }
  });

  it("positive: 'Nike partnered with Athlete X' yields 1 claim", () => {
    const out = qualifyGeneralizedClaimsV1({
      evidence_reference_id: "ev_test",
      source_id: "test.source",
      title: "",
      excerpt: "Nike partnered with Athlete X",
      retrieved_at_iso: "2026-08-08T00:00:00.000Z"
    });
    expect(out.status).toBe("qualified");
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0].subject?.canonical_name).toBe("Nike");
    expect(out.claims[0].predicate).toBe("partnered_with");
    expect(out.claims[0].object.kind).toBe("entity");
    if (out.claims[0].object.kind === "entity") {
      expect(out.claims[0].object.entity.canonical_name).toBe("Athlete X");
    }
  });

  it("positive: 'partnership between Company A and Company B' yields 1 claim", () => {
    const out = qualifyGeneralizedClaimsV1({
      evidence_reference_id: "ev_test",
      source_id: "test.source",
      title: "",
      excerpt: "A partnership between Company A and Company B was announced.",
      retrieved_at_iso: "2026-08-08T00:00:00.000Z"
    });
    expect(out.status).toBe("qualified");
    expect(out.claims).toHaveLength(1);
    expect(out.claims[0].subject?.canonical_name).toBe("Company A");
    if (out.claims[0].object.kind === "entity") {
      expect(out.claims[0].object.entity.canonical_name).toBe("Company B");
    }
  });

  const negatives = [
    "with help from Google Gemini",
    "powered by AWS",
    "working with Nike",
    "in collaboration with Adidas",
    "may partner with Nike",
    "plans to partner with Nike",
    "considering a partnership with Nike",
    "not a partnership with Nike",
    "no partnership with Nike"
  ];

  for (const s of negatives) {
    it(`negative: '${s}' yields 0 claims`, () => {
      const out = qualifyGeneralizedClaimsV1({
        evidence_reference_id: "ev_test",
        source_id: "test.source",
        title: "",
        excerpt: s,
        retrieved_at_iso: "2026-08-08T00:00:00.000Z"
      });
      expect(out.claims).toHaveLength(0);
    });
  }

  it("negative: ambiguous/missing subject yields 0 claims", () => {
    const out = qualifyGeneralizedClaimsV1({
      evidence_reference_id: "ev_test",
      source_id: "test.source",
      title: "",
      excerpt: "$75 million partnership with Google DeepMind",
      retrieved_at_iso: "2026-08-08T00:00:00.000Z"
    });
    expect(out.claims).toHaveLength(0);
  });
});

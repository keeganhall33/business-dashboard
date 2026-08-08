import { describe, expect, it } from "vitest";

import { qualifyGeneralizedClaimsV1 } from "@/lib/external-intelligence/qualification/generalized-claim-qualifier-v1";

// Production-shaped fixtures: BR-1..BR-5 title + excerpt boundary only.
// These are safe: they match persisted RSS excerpt/title data and contain no secrets.

type BoardroomFixture = {
  label: string;
  evidence_reference_id: string;
  title: string;
  excerpt: string;
};

const FIXTURES: BoardroomFixture[] = [
  {
    label: "BR-1",
    evidence_reference_id: "ev_2623049899a3bd37abf05087",
    title: "A24 Built Its Brand on Artists; Now It's Betting on AI",
    excerpt:
      "<p>A24's $75 million partnership with Google's DeepMind may make business sense, but critics argue it threatens the studio's identity and filmmaker-first ethos.</p>"
  },
  {
    label: "BR-2",
    evidence_reference_id: "ev_e911fbbfacd756c0cb7b0197",
    title: "Why Apple Doesn't Need to Win the AI Race",
    excerpt:
      "<p>After this year's WWDC, Apple's stock price took a tumble. Boardroom explains why the company's AI announcement is right on time.</p>"
  },
  {
    label: "BR-3",
    evidence_reference_id: "ev_db0124b7f977e28f283293d1",
    title: "The Many Lives of Ashley Graham",
    excerpt:
      "<p>From plus-size fashion disrupter to wine entrepreneur, supermodel Ashley Graham has never stopped expanding what’s possible, for herself or for the women who look up to her.</p>"
  },
  {
    label: "BR-4",
    evidence_reference_id: "ev_2333a0df8ca746759b64d37b",
    title: "Can ‘Disclosure Day' Break Through in 2026?",
    excerpt:
      "<p>With Backrooms and Obsession still holding screens and Spider-Man looming, Steven Spielberg’s most ambitious and fun alien film yet has a narrow window to prove itself.</p>"
  },
  {
    label: "BR-5",
    evidence_reference_id: "ev_681e80b4cc2b7e359df16c2a",
    title: "Chris Evert and Martina Navratilova Open Up About Cancer, Competition, and Netflix's ‘The Final Set'",
    excerpt:
      "<p>Chris Evert and Martina Navratilova reflect on their legendary rivalry, friendship, and Netflix documentary The Final Set on Boardroom Talks.</p>"
  }
];

describe("generalized claim v1: production-shaped Boardroom fixtures", () => {
  it("TOTAL CLAIMS = 1 and only BR-1 qualifies", () => {
    let total = 0;

    for (const fx of FIXTURES) {
      const out = qualifyGeneralizedClaimsV1({
        evidence_reference_id: fx.evidence_reference_id,
        source_id: "sports_business.boardroom",
        title: fx.title,
        excerpt: fx.excerpt,
        retrieved_at_iso: "2026-08-08T00:00:00.000Z"
      });

      if (fx.label === "BR-1") {
        expect(out.claims).toHaveLength(1);
        expect(out.claims[0].predicate).toBe("partnered_with");
        expect(out.claims[0].subject?.canonical_name).toBe("A24");
        if (out.claims[0].object.kind === "entity") {
          expect(out.claims[0].object.entity.canonical_name).toBe("Google DeepMind");
        }
      } else {
        expect(out.claims).toHaveLength(0);
      }

      total += out.claims.length;
    }

    expect(total).toBe(1);
  });
});

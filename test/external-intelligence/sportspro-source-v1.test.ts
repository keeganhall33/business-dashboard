import { describe, expect, it } from "vitest";

import {
  computeSportsProEvidenceReferenceId,
  normalizeSportsProCanonicalUrl
} from "@/lib/external-intelligence/collection/sportspro/sportspro.adapter";
import { buildSportsProEvidenceReference } from "@/lib/external-intelligence/collection/sportspro/sportspro.evidence";

describe("SportsPro source v1", () => {
  it("normalizes canonical URLs by removing tracking params + fragment (stable identity input)", () => {
    const raw = "https://www.sportspro.com/news/x/?utm_source=a&utm_medium=b#section";
    const out = normalizeSportsProCanonicalUrl(raw);
    expect(out).toBe("https://www.sportspro.com/news/x/?");
    // URL() retains a trailing ? when all params removed; stable hashing uses the exact normalized string.
    // This mirrors the Boardroom adapter behavior (URL.toString()).
  });

  it("computes stable EvidenceReference ID from canonical_url only (published_at not included)", () => {
    const canonical = "https://www.sportspro.com/news/a/";
    const id1 = computeSportsProEvidenceReferenceId({ canonical_url: canonical });
    const id2 = computeSportsProEvidenceReferenceId({ canonical_url: canonical });
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^ev_[a-f0-9]{24}$/);
  });

  it("builds EvidenceReference with locked legal policy + stable source_id", () => {
    const ev = buildSportsProEvidenceReference({
      evidence_reference_id: "ev_test",
      canonical_url: "https://www.sportspro.com/news/a/",
      guid: "https://www.sportspro.com/?p=1",
      source_item_id: "guid:https://www.sportspro.com/?p=1",
      title: "A partners with B",
      published_at_iso: "2026-08-01T00:00:00.000Z",
      collected_at_iso: "2026-08-02T00:00:00.000Z",
      author: "Author",
      categories: ["News"],
      excerpt: "A partnered with B on X.",
      feed_url: "https://www.sportspro.com/feed/",
      rss_position: 0
    });

    expect(ev.source_id).toBe("sports_business.sportspro");
    expect(ev.legal_policy_version).toBe("sportspro.rss.link_only.v1");
    expect(ev.retention_policy).toBe("link_only");
    expect(ev.source_url_or_reference).toBe("https://www.sportspro.com/news/a/");
  });

  it("creates new semantic content_hash when title changes (stable id unchanged)", () => {
    const base = {
      evidence_reference_id: "ev_same",
      canonical_url: "https://www.sportspro.com/news/a/",
      guid: null,
      source_item_id: "url:https://www.sportspro.com/news/a/",
      published_at_iso: "2026-08-01T00:00:00.000Z",
      collected_at_iso: "2026-08-02T00:00:00.000Z",
      author: null,
      categories: [],
      excerpt: "x",
      feed_url: "https://www.sportspro.com/feed/",
      rss_position: 0
    };
    const a = buildSportsProEvidenceReference({ ...base, title: "Title A" });
    const b = buildSportsProEvidenceReference({ ...base, title: "Title B" });
    expect(a.evidence_reference_id).toBe(b.evidence_reference_id);
    expect(a.content_hash).not.toBe(b.content_hash);
  });
});


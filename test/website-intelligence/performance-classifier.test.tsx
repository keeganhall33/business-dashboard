import test from "node:test";
import assert from "node:assert/strict";
import type { WebsiteSnapshotV1 } from "../../src/lib/website-intelligence/public-read/contracts";
import {
  classifyPerformanceOpportunitiesV1,
  toWebsitePerformanceSnapshotV1
} from "../../src/lib/website-intelligence/performance/classifier";

function baseSnapshot(overrides: Partial<WebsiteSnapshotV1> = {}): WebsiteSnapshotV1 {
  return {
    v: "WebsiteSnapshotV1",
    capturedAt: "2026-08-14T00:00:00.000Z",
    rootUrl: "https://example.com",
    safety: {
      readOnly: true,
      mutationDisabled: true,
      credentialsUsed: false,
      allowedMethods: ["GET"]
    },
    crawl: {
      seedUrls: ["https://example.com"],
      discoveredFrom: ["INPUT"],
      maxPages: 3,
      maxDepth: 1,
      maxConcurrency: 1,
      timeoutMs: 1000,
      stoppedReason: "NO_MORE_URLS"
    },
    pages: [],
    totals: {
      pageCount: 0,
      changedPageCount: 0,
      brokenLinkCount: 0,
      missingAltCount: 0,
      duplicateTitleCount: 0,
      duplicateMetaDescriptionCount: 0
    },
    state: "OK",
    ...overrides
  };
}

test("classifier emits top opportunities from known positive signals", () => {
  const snap = baseSnapshot({
    pages: [
      {
        v: "WebsitePageSnapshotV1",
        url: "https://example.com/a",
        finalUrl: null,
        status: 200,
        redirectedFrom: [],
        title: "A",
        metaDescription: "A",
        canonicalUrl: null,
        h1: null,
        textSummary: null,
        internalLinks: [],
        imageRefs: [{ src: "/img.png", alt: null, missingAlt: true }],
        brokenInternalLinks: ["https://example.com/missing"]
      }
    ],
    totals: {
      pageCount: 1,
      changedPageCount: 0,
      brokenLinkCount: 5,
      missingAltCount: 2,
      duplicateTitleCount: 1,
      duplicateMetaDescriptionCount: 0
    }
  });

  const perf = toWebsitePerformanceSnapshotV1(snap);
  const opps = classifyPerformanceOpportunitiesV1(perf);

  assert.equal(opps.length, 3);
  assert.equal(opps[0]?.kind, "BROKEN_INTERNAL_LINKS");
  assert.equal(opps[1]?.kind, "MISSING_ALT_TEXT");
  assert.equal(opps[2]?.kind, "DUPLICATE_TITLES");

  assert.equal(opps[0]?.signalState, "KNOWN");
  assert.equal(opps[0]?.count, 5);
  assert.ok((opps[0]?.details.exampleUrls ?? []).length > 0);
});

test("classifier preserves UNKNOWN when snapshot state is UNKNOWN", () => {
  const snap = baseSnapshot({ state: "UNKNOWN" });
  const opps = classifyPerformanceOpportunitiesV1(toWebsitePerformanceSnapshotV1(snap));

  assert.ok(opps.length > 0);
  assert.ok(opps.every((o) => o.signalState === "UNKNOWN"));
});


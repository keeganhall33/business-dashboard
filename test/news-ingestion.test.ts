import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseRssXml } from "../src/lib/news/rss.ts";
import { scoreFeedItem } from "../src/lib/news/scoring.ts";
import { enrichItem } from "../src/lib/news/enrichment.ts";

test("parseRssXml parses RSS items", () => {
  const xml = readFileSync(new URL("./fixtures/rss/sample-rss.xml", import.meta.url), "utf8");
  const items = parseRssXml(xml, "https://example.com/feed");
  assert.equal(items.length, 2);
  assert.equal(items[0].url, "https://example.com/story-1");
});

test("scoring boosts partnership/collab headlines", () => {
  const item = {
    title: "Brand signs major partnership with athlete for new drop",
    url: "https://example.com/story-1",
    guid: "story-1",
    publishedAt: new Date().toISOString(),
    summary: "",
    sourceFeedUrl: "https://example.com/feed"
  };

  const scored = scoreFeedItem(item);
  assert.ok(scored.score > 25, `expected score > 25, got ${scored.score}`);
});

test("enrichment extracts contact email when present", () => {
  const base = {
    title: "Brand signs major partnership with athlete",
    url: "https://example.com/story-1",
    guid: "story-1",
    publishedAt: new Date().toISOString(),
    summary: "Reach out at partnerships@example.com",
    sourceFeedUrl: "https://example.com/feed",
    score: 50,
    scoreSignals: ["partnership"]
  };

  const enrichment = enrichItem(base);
  assert.equal(enrichment.contactEmail, "partnerships@example.com");
  assert.equal(enrichment.contactEmailSource, "extracted");
  assert.ok(enrichment.collabConcept.length > 20);
  assert.ok(enrichment.whyNow.length > 20);
});

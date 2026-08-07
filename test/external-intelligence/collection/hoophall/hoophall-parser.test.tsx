import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { parseHoophallNewsroomListing, parseHoophallArticleDetail } from "@/lib/external-intelligence/collection/hoophall/hoophall.parser";
import { HOOPHALL_NEWSROOM_URL } from "@/lib/external-intelligence/collection/hoophall/hoophall.contract";

test("b6 hoophall: listing parses deterministically and yields canonical URLs + headlines", () => {
  const html = fs.readFileSync("test/fixtures/hoophall/news_listing.html", "utf8");
  const out = parseHoophallNewsroomListing({ url: HOOPHALL_NEWSROOM_URL, html });

  assert.ok(out.items.length >= 5);
  for (const it of out.items.slice(0, 10)) {
    assert.ok(it.url.startsWith("https://www.hoophall.com/"));
    assert.ok(it.url.includes("/news/"));
    assert.ok(it.headline.length >= 5);
  }

  // Deterministic ordering: URLs sorted ascending.
  const urls = out.items.map((i) => i.url);
  assert.deepEqual(urls.slice().sort(), urls);
});

test("b6 hoophall: detail parses stable published label + headline", () => {
  const html = fs.readFileSync("test/fixtures/hoophall/detail_enshrinement_presenters.html", "utf8");
  const out = parseHoophallArticleDetail({
    url: "https://www.hoophall.com/news/naismith-basketball-hall-of-fame-announces-2026-enshrinement-ceremony-presenters",
    html
  });

  assert.ok(out.headline.toLowerCase().includes("enshrinement"));
  assert.ok(out.published_label);
  assert.ok(out.published_label?.match(/\b\d{4}\b/));
});


import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectBoardroomRssV1,
  computeBoardroomEvidenceReferenceId,
  computeBoardroomSourceItemId
} from "../src/lib/external-intelligence/collection/boardroom/boardroom.adapter";

const fixturePath = path.join(
  process.cwd(),
  "src/lib/external-intelligence/collection/boardroom/__fixtures__/boardroom.feed.sample.xml"
);

test("boardroom.collectBoardroomRssV1 parses RSS deterministically and preserves fields", async () => {
  const xml = readFileSync(fixturePath, "utf8");

  // @ts-expect-error test override
  globalThis.fetch = async () =>
    new Response(xml, {
      status: 200,
      headers: { "content-type": "application/rss+xml" }
    });

  const out = await collectBoardroomRssV1({ now_iso: new Date().toISOString(), max_items: 5 });
  assert.equal(out.ok, true);
  if (!out.ok) return;

  assert.equal(out.items.length, 2);
  // Deterministic sort by canonical_url.
  assert.equal(out.items[0]!.canonical_url, "https://boardroom.tv/second/");
  assert.equal(out.items[1]!.canonical_url, "https://boardroom.tv/test-article/");

  const item = out.items[1]!;

  // tracking stripped
  assert.equal(item.canonical_url, "https://boardroom.tv/test-article/");

  // entity decoding
  assert.ok(item.title.includes("Test & Entities"));
  assert.ok(item.title.includes("'"));

  // guid + author + categories
  assert.equal(item.guid, "https://boardroom.tv/?p=999");
  assert.equal(item.author, "Test Author");
  assert.ok(item.categories.includes("Deals & Investments"));
  assert.ok(item.categories.includes("Sports"));

  // excerpt + full content captured
  assert.ok((item.excerpt ?? "").includes("Short excerpt"));
  assert.ok((item.rss_content_html ?? "").includes("Full body"));
});

test("boardroom.collectBoardroomRssV1 enforces max_items bound", async () => {
  const xml = readFileSync(fixturePath, "utf8");
  // @ts-expect-error test override
  globalThis.fetch = async () => new Response(xml, { status: 200 });
  const out = await collectBoardroomRssV1({ now_iso: new Date().toISOString(), max_items: 1 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.items.length, 1);
});

test("boardroom deterministic identity helpers", () => {
  const canonical = "https://boardroom.tv/test-article/";
  const ev1 = computeBoardroomEvidenceReferenceId({ canonical_url: canonical });
  const ev2 = computeBoardroomEvidenceReferenceId({ canonical_url: canonical });
  assert.equal(ev1, ev2);
  assert.ok(ev1.startsWith("ev_"));

  const src1 = computeBoardroomSourceItemId({ canonical_url: canonical, guid: "https://boardroom.tv/?p=999" });
  const src2 = computeBoardroomSourceItemId({ canonical_url: canonical, guid: null });
  assert.equal(src1, "guid:https://boardroom.tv/?p=999");
  assert.equal(src2, "url:https://boardroom.tv/test-article/");
});


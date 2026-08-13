import test from "node:test";
import assert from "node:assert/strict";
import { crawlWebsitePublicReadV1 } from "../../../src/lib/website-intelligence/public-read/public-crawler-v1";
import { diffWebsiteSnapshotV1 } from "../../../src/lib/website-intelligence/public-read/snapshot-diff-v1";

function makeFetch(fixtures: Record<string, { status: number; headers?: Record<string, string>; body?: string; finalUrl?: string }>) {
  return async (url: string, init: { method: "GET" | "HEAD" | "OPTIONS" }) => {
    const f = fixtures[url];
    if (!f) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
    const headers = new Headers(f.headers ?? { "content-type": "text/html; charset=utf-8" });
    const body = init.method === "HEAD" ? null : f.body ?? "";
    const res = new Response(body, { status: f.status, headers });
    return res;
  };
}

test("public-read crawler extracts redirects, canonical, h1, image alt, and broken internal links (bounded)", async () => {
  const root = "https://example.test/";
  const fixtures = {
    "https://example.test/robots.txt": {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n"
    },
    "https://example.test/sitemap.xml": {
      status: 200,
      headers: { "content-type": "application/xml" },
      body: `<?xml version="1.0" encoding="UTF-8"?>
        <urlset>
          <url><loc>https://example.test/</loc></url>
          <url><loc>https://example.test/about</loc></url>
        </urlset>`
    },
    "https://example.test/": {
      status: 301,
      headers: { location: "/home", "content-type": "text/plain" },
      body: "redirect"
    },
    "https://example.test/about": {
      status: 200,
      body: `<!doctype html>
        <html><head>
          <title>Home</title>
          <meta name="description" content="Welcome" />
        </head>
        <body>
          <h1>About</h1>
          <a href="/">Back</a>
        </body></html>`
    },
    "https://example.test/home": {
      status: 200,
      body: `<!doctype html>
        <html><head>
          <title>Home</title>
          <meta name="description" content="Welcome" />
          <link rel="canonical" href="https://example.test/home" />
        </head>
        <body>
          <h1>Homepage</h1>
          <a href="/about">About</a>
          <a href="/broken">Broken</a>
          <img src="/a.jpg" alt="" />
          <img src="/b.jpg" />
        </body></html>`
    },
    "https://example.test/broken": { status: 404, headers: { "content-type": "text/plain" }, body: "nope" }
  };
  const fetchFn = makeFetch(fixtures);
  const snap = await crawlWebsitePublicReadV1({
    rootUrl: root,
    maxPages: 2,
    maxDepth: 1,
    maxConcurrency: 2,
    timeoutMs: 10_000,
    linkCheckMaxPerPage: 10,
    fetchFn
  });

  assert.equal(snap.v, "WebsiteSnapshotV1");
  assert.equal(snap.safety.readOnly, true);
  assert.equal(snap.safety.mutationDisabled, true);
  assert.equal(snap.safety.credentialsUsed, false);
  assert.ok(snap.crawl.seedUrls.length >= 1);

  const home = snap.pages.find((p) => p.url === "https://example.test/");
  assert.ok(home);
  assert.equal(home.finalUrl, "https://example.test/home");
  assert.equal(home.title, "Home");
  assert.equal(home.metaDescription, "Welcome");
  assert.equal(home.canonicalUrl, "https://example.test/home");
  assert.equal(home.h1, "Homepage");
  assert.ok(home.imageRefs.some((i) => i.missingAlt));
  assert.ok(home.brokenInternalLinks.includes("https://example.test/broken"));

  assert.equal(snap.totals.pageCount, 2);
  assert.equal(snap.totals.brokenLinkCount, 1);
  assert.equal(snap.totals.missingAltCount, 2);
  // Two pages share title/meta => duplicates counted.
  assert.ok(snap.totals.duplicateTitleCount >= 2);
  assert.ok(snap.totals.duplicateMetaDescriptionCount >= 2);
});

test("snapshot diff reports changed pages deterministically", async () => {
  const mk = (title: string) =>
    makeFetch({
      "https://example.test/robots.txt": { status: 404, headers: { "content-type": "text/plain" }, body: "" },
      "https://example.test/": {
        status: 200,
        body: `<!doctype html><html><head><title>${title}</title></head><body><h1>A</h1></body></html>`
      }
    });

  const a = await crawlWebsitePublicReadV1({ rootUrl: "https://example.test/", maxPages: 1, fetchFn: mk("T1"), linkCheckMaxPerPage: 0 });
  const b = await crawlWebsitePublicReadV1({ rootUrl: "https://example.test/", maxPages: 1, fetchFn: mk("T2"), linkCheckMaxPerPage: 0 });
  const diff = diffWebsiteSnapshotV1(a, b);
  assert.deepEqual(diff.addedPages, []);
  assert.deepEqual(diff.removedPages, []);
  assert.deepEqual(diff.changedPages, ["https://example.test/"]);
  assert.equal(diff.changedPageCount, 1);
});

test("crawler respects maxPages budget", async () => {
  const fixtures = {
    "https://example.test/robots.txt": { status: 404, headers: { "content-type": "text/plain" }, body: "" },
    "https://example.test/": {
      status: 200,
      body: `<!doctype html><html><head><title>One</title></head><body><a href="/two">Two</a></body></html>`
    },
    "https://example.test/two": { status: 200, body: "<html><head><title>Two</title></head><body></body></html>" }
  };
  const snap = await crawlWebsitePublicReadV1({
    rootUrl: "https://example.test/",
    seedUrls: ["https://example.test/"],
    maxPages: 1,
    maxDepth: 2,
    maxConcurrency: 2,
    timeoutMs: 10_000,
    fetchFn: makeFetch(fixtures),
    linkCheckMaxPerPage: 0
  });
  assert.equal(snap.pages.length, 1);
  assert.equal(snap.crawl.stoppedReason, "MAX_PAGES");
});

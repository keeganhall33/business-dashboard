import test from "node:test";
import assert from "node:assert/strict";

import { collectHoophallNewsroomV1 } from "@/lib/external-intelligence/collection/hoophall/hoophall.adapter";

type MockFetch = (input: string, init?: RequestInit) => Promise<Response>;

function mockResponse(input: { status: number; headers?: Record<string, string>; body: string }) {
  return new Response(input.body, { status: input.status, headers: input.headers });
}

test("b6 hoophall: rejects wrong host and refuses redirects", async () => {
  const fetch: MockFetch = async (url) => {
    if (String(url).includes("/news/")) {
      // simulate redirect response
      return mockResponse({
        status: 302,
        headers: { location: "https://example.com/evil" },
        body: ""
      });
    }
    return mockResponse({ status: 500, body: "" });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error - fetch signature compatible
    fetch,
    detail_fetch_cap: 1
  });

  assert.equal(out.ok, false);
  const err = (out as { ok: false; error: string }).error;
  assert.ok(String(err).includes("wrong_host"));
});

test("b6 hoophall: allows one same-host canonical redirect and revalidates final URL", async () => {
  const listingBody = `<div class="news-feed-list"><div class="news-feed-item-wrapper"><span class="overline-title">Friday, August 07, 2026</span><h5 class="article-title"><a href="https://www.hoophall.com/news/item-1">Item</a></h5><div class="article-description">July 15, 2026</div></div></div></div></div>`;
  let call = 0;
  const fetch: MockFetch = async () => {
    call += 1;
    if (call === 1) {
      return mockResponse({ status: 301, headers: { location: "https://www.hoophall.com/news" }, body: "" });
    }
    return mockResponse({ status: 200, headers: { "content-type": "text/html" }, body: listingBody });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error fetch type mismatch is acceptable in test: we inject a MockFetch.
    fetch,
    detail_fetch_cap: 0
  });

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.listing.items.length, 1);
});

test("b6 hoophall: second redirect fails closed", async () => {
  let call = 0;
  const fetch: MockFetch = async () => {
    call += 1;
    if (call === 1) {
      return mockResponse({ status: 301, headers: { location: "https://www.hoophall.com/news" }, body: "" });
    }
    return mockResponse({ status: 302, headers: { location: "https://www.hoophall.com/news" }, body: "" });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error fetch type mismatch is acceptable in test: we inject a MockFetch.
    fetch,
    detail_fetch_cap: 0
  });

  assert.equal(out.ok, false);
  const err = (out as { ok: false; error: string }).error;
  assert.ok(err.includes("redirect"));
});

test("b6 hoophall: redirect loop fails closed", async () => {
  let call = 0;
  const fetch: MockFetch = async () => {
    call += 1;
    if (call === 1) {
      return mockResponse({ status: 301, headers: { location: "https://www.hoophall.com/news/" }, body: "" });
    }
    return mockResponse({ status: 200, headers: { "content-type": "text/html" }, body: "<div class=\"news-feed-list\"></div>" });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error test injects MockFetch; type mismatch is expected.
    fetch,
    detail_fetch_cap: 0
  });

  assert.equal(out.ok, false);
  const err = (out as { ok: false; error: string }).error;
  assert.ok(err.includes("redirect_loop"));
});

test("b6 hoophall: enforces response size cap", async () => {
  const big = "x".repeat(2_000_000);
  const fetch: MockFetch = async () => {
    return mockResponse({ status: 200, headers: { "content-type": "text/html" }, body: big });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error - fetch signature compatible
    fetch,
    detail_fetch_cap: 1
  });

  assert.equal(out.ok, false);
  const err = (out as { ok: false; error: string }).error;
  assert.ok(String(err).includes("response_too_large"));
});

test("b6 hoophall: detail fetch cap is exactly enforced (5) and remaining candidates are deferred", async () => {
  // Build a minimal listing HTML with 6 items, each requiring detail (no Month DD, YYYY in listing).
  const mk = (i: number) => `
    <div class="news-feed-item-wrapper">
      <span class="overline-title">Friday, August 07, 2026</span>
      <h5 class="article-title"><a href="https://www.hoophall.com/news/item-${i}">Item ${i}</a></h5>
      <div class="article-description">No explicit date here.</div>
    </div></div></div>`;
  const listingHtml = `<div class="news-feed-list">${[1, 2, 3, 4, 5, 6].map(mk).join("\n")}</div>`;

  let detailCalls = 0;
  const fetch: MockFetch = async (url) => {
    if (String(url).endsWith("/news/")) {
      return mockResponse({ status: 200, headers: { "content-type": "text/html" }, body: listingHtml });
    }
    detailCalls += 1;
    return mockResponse({
      status: 200,
      headers: { "content-type": "text/html" },
      body: `<div class="hero-body news"><span class="overline-title">July 15, 2026</span><h1>Item</h1></div>`
    });
  };

  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error - fetch signature compatible
    fetch,
    detail_fetch_cap: 5
  });

  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(detailCalls, 5);
  assert.equal(out.meta.detail_fetches, 5);
  assert.equal(out.meta.deferred_detail_candidates, 1);
});

test("b6 hoophall: timeout surfaces as hoophall_timeout", async () => {
  const fetch: MockFetch = async () => {
    // Simulate an AbortError thrown by fetch.
    const e = new Error("aborted");
    (e as Error & { name: string }).name = "AbortError";
    throw e;
  };
  const out = await collectHoophallNewsroomV1({
    now_iso: "2026-08-07T00:00:00.000Z",
    // @ts-expect-error fetch type mismatch is acceptable in test: we inject a MockFetch.
    fetch,
    detail_fetch_cap: 1
  });
  assert.equal(out.ok, false);
  const err = (out as { ok: false; error: string }).error;
  assert.ok(err.includes("hoophall_timeout"));
});

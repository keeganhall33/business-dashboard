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
  assert.ok(String(err).startsWith("hoophall_network_blocked:"));
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

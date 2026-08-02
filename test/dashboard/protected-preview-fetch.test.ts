import test from "node:test";
import assert from "node:assert/strict";

import { getDashboardOverview } from "@/lib/api/dashboard";

test("fetchJson: throws a controlled error when response is not JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("<!DOCTYPE html><html><body>login</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    })) as unknown as typeof fetch;

  await assert.rejects(
    () => getDashboardOverview({ preset: "year_to_date" }, { baseUrl: "https://example.test", cookie: "a=b" }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /expected JSON/i);
      assert.ok(!err.message.includes("<!DOCTYPE"));
      return true;
    }
  );

  globalThis.fetch = originalFetch;
});

test("getDashboardOverview: forwards cookie header in server context", async () => {
  const originalFetch = globalThis.fetch;
  let seenCookie: string | null = null;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers ?? {});
    seenCookie = h.get("cookie");
    return new Response(JSON.stringify({ timestamp: new Date().toISOString(), range: { preset: "year_to_date" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as unknown as typeof fetch;

  await getDashboardOverview({ preset: "year_to_date" }, { baseUrl: "https://example.test", cookie: "session=abc" });
  assert.equal(seenCookie, "session=abc");

  globalThis.fetch = originalFetch;
});

import test from "node:test";
import assert from "node:assert/strict";

import { getDashboardWebsiteIntelV1 } from "../../src/lib/website-intelligence/dashboard-website-intel-v1";

test("dashboard website intel maps snapshot totals into read-only cards", async () => {
  process.env.PUBLIC_WEBSITE_ROOT_URL = "https://example.com/";

  const fakeFetch = async () => {
    return new Response("<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" }
    });
  };

  const out = await getDashboardWebsiteIntelV1({ fetchFn: fakeFetch as any, nowFn: () => 0 });
  assert.equal(out.availability, "AVAILABLE");
  assert.equal(out.snapshotCard.readOnly, true);
  assert.equal(out.snapshotCard.mutationDisabled, true);
  assert.equal(out.snapshotCard.pageCount, 1);
});

test("dashboard website intel returns explicit UNAVAILABLE when root url is not configured", async () => {
  delete process.env.PUBLIC_WEBSITE_ROOT_URL;
  delete process.env.NEXT_PUBLIC_WEBSITE_ROOT_URL;
  const out = await getDashboardWebsiteIntelV1({ nowFn: () => 0 });
  assert.equal(out.availability, "UNAVAILABLE");
  assert.equal(out.snapshotCard.state, "UNKNOWN");
});


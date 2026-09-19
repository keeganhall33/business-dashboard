import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetaGraphUrlV1,
  fetchAllMetaInsightPagesV1,
  META_GRAPH_API_VERSION_V1,
} from "../../../scripts/lib/meta-insights-pagination-v1.mjs";

const INITIAL_URL = "https://graph.facebook.com/v25.0/act_123/insights?level=campaign";
const TOKEN = "test-token";

function response(payload: unknown, overrides: Partial<{ ok: boolean; status: number; statusText: string }> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
    ...overrides,
  };
}

test("pins the live reporting path to the supported Meta Graph API v25 contract", () => {
  assert.equal(META_GRAPH_API_VERSION_V1, "v25.0");
  assert.equal(buildMetaGraphUrlV1("/me/adaccounts").toString(), "https://graph.facebook.com/v25.0/me/adaccounts");
  assert.equal(buildMetaGraphUrlV1("/act_123/insights").toString(), "https://graph.facebook.com/v25.0/act_123/insights");
});

test("collects every Meta insights page before reporting source completeness", async () => {
  const calls: string[] = [];
  const second = "https://graph.facebook.com/v25.0/act_123/insights?level=campaign&after=cursor-2";
  const result = await fetchAllMetaInsightPagesV1({
    initialUrl: INITIAL_URL,
    accessToken: TOKEN,
    fetchImpl: async (url: string) => {
      calls.push(url);
      if (calls.length === 1) {
        return response({ data: [{ campaign_id: "1" }], paging: { next: second } });
      }
      return response({ data: [{ campaign_id: "2" }] });
    },
  });

  assert.deepEqual(result.data, [{ campaign_id: "1" }, { campaign_id: "2" }]);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.paginationComplete, true);
  assert.equal(calls.length, 2);
});

test("fails closed instead of following a paging URL to another origin", async () => {
  let calls = 0;
  await assert.rejects(
    fetchAllMetaInsightPagesV1({
      initialUrl: INITIAL_URL,
      accessToken: TOKEN,
      fetchImpl: async () => {
        calls += 1;
        return response({
          data: [{ campaign_id: "1" }],
          paging: { next: "https://example.com/steal-token?after=cursor" },
        });
      },
    }),
    /paging URL changed endpoint/,
  );
  assert.equal(calls, 1);
});

test("fails closed on repeated paging URLs", async () => {
  await assert.rejects(
    fetchAllMetaInsightPagesV1({
      initialUrl: INITIAL_URL,
      accessToken: TOKEN,
      fetchImpl: async () => response({ data: [], paging: { next: INITIAL_URL } }),
    }),
    /paging loop detected/,
  );
});

test("fails closed on malformed page data instead of treating it as an empty page", async () => {
  await assert.rejects(
    fetchAllMetaInsightPagesV1({
      initialUrl: INITIAL_URL,
      accessToken: TOKEN,
      fetchImpl: async () => response({ paging: {} }),
    }),
    /malformed page data/,
  );
});

test("fails closed when pagination exceeds the bounded page limit", async () => {
  let index = 0;
  await assert.rejects(
    fetchAllMetaInsightPagesV1({
      initialUrl: INITIAL_URL,
      accessToken: TOKEN,
      maxPages: 2,
      fetchImpl: async () => {
        index += 1;
        return response({
          data: [{ campaign_id: String(index) }],
          paging: {
            next: `https://graph.facebook.com/v25.0/act_123/insights?level=campaign&after=${index}`,
          },
        });
      },
    }),
    /pagination exceeded 2 pages/,
  );
  assert.equal(index, 2);
});

test("fails closed when a later page request fails", async () => {
  let calls = 0;
  const second = "https://graph.facebook.com/v25.0/act_123/insights?level=campaign&after=cursor-2";
  await assert.rejects(
    fetchAllMetaInsightPagesV1({
      initialUrl: INITIAL_URL,
      accessToken: TOKEN,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return response({ data: [{ campaign_id: "1" }], paging: { next: second } });
        }
        return response({ error: { message: "rate limited" } }, { ok: false, status: 429, statusText: "Too Many Requests" });
      },
    }),
    /Meta insights API failed \(429 Too Many Requests\)/,
  );
  assert.equal(calls, 2);
});

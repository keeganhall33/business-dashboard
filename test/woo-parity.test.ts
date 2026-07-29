import test from "node:test";
import assert from "node:assert/strict";
import { fetchWooEligibleSet, hashIdSet } from "@/lib/woo/woo-parity";

function makeOrder(input: Partial<Record<string, unknown>> & { id: number }) {
  return {
    id: input.id,
    status: input.status ?? "completed",
    currency: input.currency ?? "USD",
    total: input.total ?? "10.00",
    total_refunded: input.total_refunded ?? "0.00",
    discount_total: "0.00",
    shipping_total: "0.00",
    total_tax: "0.00",
    date_created_gmt: input.date_created_gmt ?? "2026-06-01T00:00:00Z",
    date_paid_gmt: input.date_paid_gmt,
    date_modified_gmt: input.date_modified_gmt ?? input.date_paid_gmt
  };
}

function mockFetchPages(pages: unknown[][], opts?: { failPage?: number; failTimes?: number }) {
  const failPage = opts?.failPage ?? null;
  let remainingFails = opts?.failTimes ?? 0;

  return async (url: string) => {
    const u = new URL(url);
    const page = Number(u.searchParams.get("page") ?? "1");

    if (failPage && page === failPage && remainingFails > 0) {
      remainingFails -= 1;
      return new Response(JSON.stringify({ message: "simulated" }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const rows = pages[page - 1] ?? [];
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("comparator includes created-before range but paid-inside", async () => {
  const fetchImpl = mockFetchPages([
    [
      makeOrder({
        id: 1,
        date_created_gmt: "2025-01-01T00:00:00Z",
        date_paid_gmt: "2025-07-30T12:00:00Z",
        date_modified_gmt: "2026-01-01T00:00:00Z"
      })
    ]
  ]);

  const { rows } = await fetchWooEligibleSet(
    { baseUrl: "https://example.com", consumerKey: "k", consumerSecret: "s", startDate: "2025-07-30", endDate: "2025-07-30" },
    fetchImpl as unknown as typeof fetch,
    async () => {}
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
});

test("comparator excludes created-inside but paid-after", async () => {
  const fetchImpl = mockFetchPages([
    [
      makeOrder({ id: 2, date_paid_gmt: "2025-08-01T00:00:00Z" })
    ]
  ]);

  const { rows } = await fetchWooEligibleSet(
    { baseUrl: "https://example.com", consumerKey: "k", consumerSecret: "s", startDate: "2025-07-30", endDate: "2025-07-30" },
    fetchImpl as unknown as typeof fetch,
    async () => {}
  );

  assert.equal(rows.length, 0);
});

test("comparator handles duplicate IDs across pages", async () => {
  const paid = "2025-07-30T12:00:00Z";
  const fetchImpl = mockFetchPages([
    Array.from({ length: 100 }, (_, idx) => makeOrder({ id: 1000 + idx, date_paid_gmt: paid })),
    [makeOrder({ id: 1000, date_paid_gmt: paid })],
    []
  ]);

  const out = await fetchWooEligibleSet(
    { baseUrl: "https://example.com", consumerKey: "k", consumerSecret: "s", startDate: "2025-07-30", endDate: "2025-07-30" },
    fetchImpl as unknown as typeof fetch,
    async () => {}
  );

  assert.equal(out.stats.duplicateCandidateIds, 1);
});

test("comparator retries after failed middle page", async () => {
  const paid = "2025-07-30T12:00:00Z";
  const fetchImpl = mockFetchPages(
    [
      Array.from({ length: 100 }, (_, idx) => makeOrder({ id: 2000 + idx, date_paid_gmt: paid })),
      [],
      []
    ],
    { failPage: 1, failTimes: 2 }
  );

  const out = await fetchWooEligibleSet(
    { baseUrl: "https://example.com", consumerKey: "k", consumerSecret: "s", startDate: "2025-07-30", endDate: "2025-07-30" },
    fetchImpl as unknown as typeof fetch,
    async () => {}
  );

  assert.equal(out.stats.retryCount, 2);
});

test("negative: telemetry missing one eligible order is detected by set hash", () => {
  const wooIds = [1, 2, 3];
  const telIds = [1, 2];
  assert.notEqual(hashIdSet(wooIds), hashIdSet(telIds));
});

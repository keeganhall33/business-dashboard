import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWebsiteSnapshot } from "../src/lib/dashboard/normalize-website-snapshot";
import type { WebsiteConversionSnapshot } from "../src/lib/types/dashboard";

test("normalizeWebsiteSnapshot derives customer name from Woo billing when missing", () => {
  type RecentOrder = NonNullable<NonNullable<WebsiteConversionSnapshot["wooCommerce"]>["recentOrders"]>[number];
  const input: WebsiteConversionSnapshot = {
    generatedAt: new Date().toISOString(),
    wooCommerce: {
      recentOrders: [
        {
          id: 123,
          status: "completed",
          total: 250,
          currency: "USD",
          date: "2026-07-01T00:00:00.000Z",
          customer: null,
          // Extra fields from Woo API can exist even if not typed.
          billing: { first_name: "Ada", last_name: "Lovelace" },
          number: "1009"
        } as unknown as RecentOrder & { billing: { first_name: string; last_name: string }; number: string }
      ]
    }
  };

  const normalized = normalizeWebsiteSnapshot(input);
  const order = normalized.wooCommerce?.recentOrders?.[0] as unknown as { customer: string | null; number?: string | null };
  assert.equal(order.customer, "Ada Lovelace");
  assert.equal(order.number, "1009");
});

test("normalizeWebsiteSnapshot preserves existing customer name", () => {
  const input: WebsiteConversionSnapshot = {
    generatedAt: new Date().toISOString(),
    wooCommerce: {
      recentOrders: [{ id: 1, status: "processing", total: 10, currency: "USD", customer: "Keegan", date: null } as unknown as NonNullable<NonNullable<WebsiteConversionSnapshot["wooCommerce"]>["recentOrders"]>[number]]
    }
  };

  const normalized = normalizeWebsiteSnapshot(input);
  assert.equal(normalized.wooCommerce?.recentOrders?.[0]?.customer, "Keegan");
});

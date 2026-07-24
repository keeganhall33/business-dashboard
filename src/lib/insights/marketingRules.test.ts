import test from "node:test";
import assert from "node:assert/strict";
import { evaluateInsights } from "./marketingRules";

const baseRange = { preset: "7d", startDate: "2026-06-11", endDate: "2026-06-17" };

function buildContext(overrides: Partial<Parameters<typeof evaluateInsights>[0]> = {}) {
  return {
    range: baseRange,
    website: overrides.website ?? {
      generatedAt: new Date().toISOString(),
      ga4: { addToCartEvents: 200, beginCheckoutEvents: 5, ecommercePurchases: 3 },
      wooCommerce: { orderCount: 3 }
    },
    meta: overrides.meta ?? {
      generatedAt: new Date().toISOString(),
      summary: { spend: 70, purchases: 1 },
      campaigns: [{ campaignId: "1", campaignName: "Only" }]
    },
    funnel: overrides.funnel ?? {
      timeseries: [{ date: "2026-06-17", entries: 62, completions: 3 }]
    },
    salesGeography: overrides.salesGeography ?? null,
    previousWebsite: overrides.previousWebsite,
    previousMeta: overrides.previousMeta,
    previousFunnel: overrides.previousFunnel,
    metricDeltas: overrides.metricDeltas ?? [],
    productMomentum: overrides.productMomentum ?? null
  };
}

test("cart → checkout rule fires when retention low", () => {
  const ctx = buildContext();
  const { top } = evaluateInsights(ctx);
  const ids = top.map((i) => i.id);
  assert(ids.includes("cart_checkout_drop"));
});

test("cart → checkout rule suppressed when stale", () => {
  const staleWebsite = { ...buildContext().website!, generatedAt: new Date(Date.now() - 48 * 36e5).toISOString() };
  const { top, suppressed } = evaluateInsights({ ...buildContext(), website: staleWebsite });
  assert(!top.some((i) => i.id === "cart_checkout_drop"));
  assert(suppressed.some((i) => i.id === "cart_checkout_drop"));
});

test("meta low volume rule triggers when purchases < 3", () => {
  const ctx = buildContext({ meta: { generatedAt: new Date().toISOString(), summary: { spend: 100, purchases: 1 }, campaigns: [{ campaignId: "1", campaignName: "A" }] } });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "meta_low_volume"));
});

test("meta single campaign rule suppressed when stale", () => {
  const ctx = buildContext({ meta: { generatedAt: new Date(Date.now() - 50 * 36e5).toISOString(), summary: { spend: 0, purchases: 0 }, campaigns: [{ campaignId: "1", campaignName: "A" }] } });
  const { suppressed } = evaluateInsights(ctx);
  assert(suppressed.some((i) => i.id === "meta_single_campaign"));
});

test("woo vs GA rule fires when difference > 20%", () => {
  const ctx = buildContext({ website: { generatedAt: new Date().toISOString(), ga4: { ecommercePurchases: 2 }, wooCommerce: { orderCount: 5 } } });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "woo_ga_mismatch"));
});

test("sessions up but revenue flat surfaces comparison insight", () => {
  const ctx = buildContext({
    metricDeltas: [
      { metric: "sessions", label: "Sessions", unit: null, currentValue: 1000, previousValue: 800, absoluteChange: 200, percentChange: 25, direction: "up" },
      { metric: "woo_revenue", label: "Revenue", unit: "usd", currentValue: 1000, previousValue: 995, absoluteChange: 5, percentChange: 0.5, direction: "up" }
    ]
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "sessions_up_revenue_flat"));
});

test("meta spend up without purchase growth is flagged", () => {
  const ctx = buildContext({
    metricDeltas: [
      { metric: "meta_spend", label: "Meta spend", unit: "usd", currentValue: 200, previousValue: 150, absoluteChange: 50, percentChange: 33, direction: "up" },
      { metric: "meta_purchases", label: "Meta purchases", unit: null, currentValue: 3, previousValue: 3, absoluteChange: 0, percentChange: 0, direction: "up" }
    ]
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "meta_spend_up_flat_purchases"));
});

test("product momentum suppression is surfaced", () => {
  const ctx = buildContext({ productMomentum: { winners: [], laggards: [], newBreakouts: [], concentration: null, suppressedReasons: ["Missing product data"] } });
  const { suppressed } = evaluateInsights(ctx);
  assert(suppressed.some((i) => i.id === "product_momentum_unavailable"));
});

test("product winner insight fires when revenue jumps", () => {
  const ctx = buildContext({
    productMomentum: {
      winners: [{ name: "Ken Griffey Jr", revenueDeltaPercent: 25, revenueDelta: 50 }],
      laggards: [],
      newBreakouts: [],
      concentration: null,
      suppressedReasons: []
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "product_momentum_winner"));
});

test("product breakout rule fires when new product appears", () => {
  const ctx = buildContext({
    productMomentum: {
      winners: [],
      laggards: [],
      newBreakouts: [{ name: "Kelly Slater", currentRevenue: 500, currentUnits: 5 }],
      concentration: null,
      suppressedReasons: []
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "product_new_breakout"));
});

test("product concentration rule fires when share high", () => {
  const ctx = buildContext({
    productMomentum: {
      winners: [],
      laggards: [],
      newBreakouts: [],
      concentration: { topProduct: "Ken Griffey Jr", sharePercent: 70, revenue: 1000 },
      suppressedReasons: []
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "product_revenue_concentration"));
});

test("geography new location insight fires when comparison present", () => {
  const ctx = buildContext({
    salesGeography: {
      range: baseRange,
      locations: [],
      summary: {
        totalLocations: 1,
        topCountry: { label: "US", revenue: 100 },
        topRegion: null,
        topCity: null,
        domesticRevenue: 100,
        internationalRevenue: 0
      },
      comparison: {
        currentRange: baseRange,
        previousRange: baseRange,
        newLocations: [
          {
            id: "country:us",
            label: "United States",
            privacyLevel: "country",
            currentRevenue: 200,
            previousRevenue: 0,
            revenueDelta: 200,
            revenueDeltaPercent: null,
            currentOrders: 3,
            previousOrders: 0,
            direction: "new"
          }
        ],
        risingLocations: [],
        coolingLocations: [],
        domesticDelta: 200,
        internationalDelta: 0,
        summary: []
      }
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "sales_geography_new_location"));
});

test("geography domestic delta insight fires when delta large", () => {
  const ctx = buildContext({
    salesGeography: {
      range: baseRange,
      locations: [],
      summary: {
        totalLocations: 1,
        topCountry: { label: "US", revenue: 500 },
        topRegion: null,
        topCity: null,
        domesticRevenue: 500,
        internationalRevenue: 0
      },
      comparison: {
        currentRange: baseRange,
        previousRange: baseRange,
        newLocations: [],
        risingLocations: [],
        coolingLocations: [],
        domesticDelta: -200,
        internationalDelta: 0,
        summary: []
      }
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "sales_geography_domestic_delta"));
});

test("sales geography suppression is surfaced", () => {
  const ctx = buildContext({
    salesGeography: {
      range: baseRange,
      locations: [],
      summary: {
        totalLocations: 0,
        topCountry: null,
        topRegion: null,
        topCity: null,
        domesticRevenue: 0,
        internationalRevenue: 0
      },
      suppressedReasons: ["No Woo geography"],
      privacyNotes: [],
      source: "woo"
    }
  });
  const { suppressed } = evaluateInsights(ctx);
  assert(suppressed.some((i) => i.id === "sales_geography_unavailable"));
});

test("sales geography concentration insight fires when one city dominates", () => {
  const ctx = buildContext({
    salesGeography: {
      range: baseRange,
      locations: [
        {
          id: "city:Seattle, WA",
          label: "Seattle, WA",
          city: "Seattle",
          state: "WA",
          country: "United States",
          privacyLevel: "city",
          orderCount: 4,
          revenue: 900,
          units: 4,
          topProducts: []
        },
        {
          id: "city:Los Angeles, CA",
          label: "Los Angeles, CA",
          city: "Los Angeles",
          state: "CA",
          country: "United States",
          privacyLevel: "city",
          orderCount: 3,
          revenue: 100,
          units: 3,
          topProducts: []
        }
      ],
      summary: {
        totalLocations: 2,
        topCountry: { label: "United States", revenue: 1000 },
        topRegion: { label: "Washington|United States", revenue: 900 },
        topCity: { label: "Seattle, WA", revenue: 900 },
        domesticRevenue: 1000,
        internationalRevenue: 0
      },
      privacyNotes: [],
      source: "woo"
    }
  });
  const { top } = evaluateInsights(ctx);
  assert(top.some((i) => i.id === "sales_geography_concentration"));
});

import type {
  ProductConversionIntelligence,
  ProductConversionRow,
  ProductConversionRangeSnapshot,
  ProductConversionChecklistItem,
  RangePreset
} from "@/lib/types/dashboard";

const SUPPORTED_RANGES: RangePreset[] = ["30d", "365d"];
const RANGE_LABELS: Record<RangePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 6 months",
  "365d": "Last 12 months",
  ytd: "Year to date",
  custom: "Custom"
};

const rows: ProductConversionRow[] = [
  buildRow({
    productId: 34135,
    productName: "Rory McIlroy",
    slug: "rory-mcilroy",
    priceLabel: "$4,500 collector drop",
    classification: "HIGH_TRAFFIC_LOW_SALES",
    summary: "Hundreds of PDP sessions hit the Rory drop but only two add-to-cart events in the last 30 days. The only Woo revenue was a single $4.5K collector order earlier this year.",
    recommendedAction: "Refresh the PDP hero with new process photos + social proof, then pair with a zero-friction collector outreach before reopening a premium reservation window.",
    confidence: "medium",
    tags: ["High traffic", "Weak cart conversion"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics (24 Jun 2026)",
        confidence: "medium",
        gaPageViews: 463,
        gaViewItem: 158,
        gaAddToCart: 2,
        wooRevenue: 0,
        wooUnits: 0,
        wooAov: null,
        notes: ["No Woo orders in this 30d window"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics + Woo order 102976",
        confidence: "medium",
        gaPageViews: 5975,
        gaViewItem: 2269,
        gaAddToCart: 117,
        wooRevenue: 4500,
        wooUnits: 1,
        wooAov: 4500,
        notes: ["Single collector drop recorded"]
      })
    ]
  }),
  buildRow({
    productId: 32131,
    productName: "Bo Jackson",
    slug: "bo-knows-bo-jackson",
    priceLabel: "$75 print",
    classification: "HIGH_CARTS_LOW_SALES",
    summary: "Bo still drives the steadiest PDP volume among $75 prints (96 view_item / 12 add-to-cart in 30d) but no Woo revenue hit during the same window.",
    recommendedAction: "Add an in-cart upsell for signed variants and run a quick checkout sanity check (shipping, tax, coupon messaging) before pushing a promo block on the Shop page.",
    confidence: "medium",
    tags: ["Cart energy", "Needs checkout proof"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics (24 Jun 2026)",
        confidence: "medium",
        gaPageViews: 97,
        gaViewItem: 96,
        gaAddToCart: 12,
        wooRevenue: 0,
        wooUnits: 0,
        wooAov: null,
        notes: ["Zero Woo checkouts recorded in this window"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics (365d)",
        confidence: "medium",
        gaPageViews: 1407,
        gaViewItem: 1303,
        gaAddToCart: 28,
        wooRevenue: null,
        wooUnits: null,
        wooAov: null,
        notes: ["Need Woo order join for per-product sales"]
      })
    ]
  }),
  buildRow({
    productId: 103142,
    productName: "A Champion’s Release",
    slug: "a-champions-release",
    priceLabel: "$395 limited edition",
    classification: "INSTRUMENTATION_GAP",
    summary: "The PDP logs 29 page views in 30d, but view_item + add_to_cart flatline because the PDP uses a custom template that never fires GA4 ecommerce events.",
    recommendedAction: "Fix GA4 instrumentation on the PDP and builder (view_item + add_to_cart), then relaunch with a waitlist CTA tied to the Woo product ID.",
    confidence: "medium",
    instrumentationGap: true,
    tags: ["Instrumentation", "Limited run"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics (24 Jun 2026)",
        confidence: "low",
        gaPageViews: 29,
        gaViewItem: 0,
        gaAddToCart: 0,
        wooRevenue: 0,
        wooUnits: 0,
        wooAov: null,
        notes: ["view_item missing — instrumentation gap"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics + Woo order 103204",
        confidence: "medium",
        gaPageViews: 606,
        gaViewItem: 528,
        gaAddToCart: 75,
        wooRevenue: 395,
        wooUnits: 1,
        wooAov: 395,
        notes: ["Preview campaign produced a single Woo order"]
      })
    ]
  }),
  buildRow({
    productId: 64687,
    productName: "Kelly Slater",
    slug: "kelly-slater",
    priceLabel: "$75 print / $500 KEEGAN200",
    classification: "CURRENT_MOMENTUM",
    summary: "Paid + organic search keep feeding Kelly traffic (40 view_item / 2 carts in 30d). A $75 order closed this week, suggesting low-effort promo can revive the run.",
    recommendedAction: "Use the new PDP editor to feature the recent process video and re-promote to golf + surf collectors with a short Instagram reel.",
    confidence: "medium",
    tags: ["Paid social", "Fresh sale"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics + Woo order 103272",
        confidence: "medium",
        gaPageViews: 49,
        gaViewItem: 40,
        gaAddToCart: 2,
        wooRevenue: 75,
        wooUnits: 1,
        wooAov: 75,
        notes: ["Paid IG → PDP → Woo order"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics (365d)",
        confidence: "medium",
        gaPageViews: 590,
        gaViewItem: 323,
        gaAddToCart: 12,
        wooRevenue: null,
        wooUnits: null,
        wooAov: null,
        notes: ["Need Woo rollup for long-range revenue"]
      })
    ]
  }),
  buildRow({
    productId: 69519,
    productName: "Gary Payton",
    slug: "gary-payton",
    priceLabel: "$300 limited",
    classification: "HISTORICAL_ANCHOR",
    summary: "Gary spikes whenever Seattle stories land (33 view_item / 2 carts in 30d) and already closed a $300 order in the current 7d Woo snapshot.",
    recommendedAction: "Queue a collector email that pairs the Gary story with the new Rory work and test an upsell to the #KEEGAN200 variant.",
    confidence: "high",
    tags: ["Recent sale", "Collector favorite"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics + Woo snapshot",
        confidence: "medium",
        gaPageViews: 35,
        gaViewItem: 33,
        gaAddToCart: 2,
        wooRevenue: 300,
        wooUnits: 1,
        wooAov: 300,
        notes: ["Latest Woo snapshot captured 1 order"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics (365d)",
        confidence: "medium",
        gaPageViews: 349,
        gaViewItem: 153,
        gaAddToCart: 10,
        wooRevenue: null,
        wooUnits: null,
        wooAov: null,
        notes: ["Need Woo order join for lifetime totals"]
      })
    ]
  }),
  buildRow({
    productId: 33668,
    productName: "Eddie Vedder",
    slug: "eddie-vedder",
    priceLabel: "$75 print / $500 collector",
    classification: "HISTORICAL_ANCHOR",
    summary: "Eddie is a proven historical seller but current demand is muted (17 view_item in 30d). Use it as a scarcity lever rather than chasing volume.",
    recommendedAction: "Keep it in reserve for a Pearl Jam cultural beat — bundle with process notes or studio photos when the timing is right.",
    confidence: "medium",
    tags: ["Data light"],
    ranges: [
      buildRange({
        range: "30d",
        label: RANGE_LABELS["30d"],
        source: "GA4 slug metrics (24 Jun 2026)",
        confidence: "low",
        gaPageViews: 20,
        gaViewItem: 17,
        gaAddToCart: 0,
        wooRevenue: 0,
        wooUnits: 0,
        wooAov: null,
        notes: ["No carts recorded"]
      }),
      buildRange({
        range: "365d",
        label: RANGE_LABELS["365d"],
        source: "GA4 slug metrics (365d)",
        confidence: "medium",
        gaPageViews: 210,
        gaViewItem: 181,
        gaAddToCart: 7,
        wooRevenue: null,
        wooUnits: null,
        wooAov: null,
        notes: ["Need Woo order join"]
      })
    ]
  })
];

const instrumentationChecklist: ProductConversionChecklistItem[] = [
  {
    label: "Attach Woo product_id + SKU to GA4 view_item / add_to_cart / begin_checkout / purchase events",
    status: "blocked",
    detail: "GA4 ecommerce item payload is empty — prevents product-level checkout attribution."
  },
  {
    label: "Emit cart line items on begin_checkout",
    status: "todo",
    detail: "Needed to flag high add-to-cart → low purchase gaps at the SKU level."
  },
  {
    label: "Nightly GA4 order_id → Woo line-item join",
    status: "todo",
    detail: "Allows safe purchase attribution even before GA4 item payload ships."
  },
  {
    label: "Expose GA4 slug metrics via Supabase view",
    status: "ready",
    detail: "Prototype uses ga4-product-sample-*.json; migrate into Supabase once schema approved."
  }
];

export function loadProductConversionPrototype(): ProductConversionIntelligence {
  return {
    generatedAt: "2026-06-24T23:35:21.663Z",
    supportedRanges: SUPPORTED_RANGES,
    rows,
    instrumentationChecklist,
    notes: [
      "Derived from diagnostics: artifacts/ga4-product-sample-*.json and woo product metadata (24 Jun 2026)",
      "Woo revenue reflects observed orders only; additional historical sales will populate once the Supabase join ships"
    ]
  };
}

function buildRow(row: Omit<ProductConversionRow, "ranges"> & { ranges: ProductConversionRangeSnapshot[] }): ProductConversionRow {
  return {
    ...row,
    ranges: row.ranges
  };
}

function buildRange(snapshot: ProductConversionRangeSnapshot): ProductConversionRangeSnapshot {
  const next: ProductConversionRangeSnapshot = {
    ...snapshot,
    gaViewToCartRate: calculateRate(snapshot.gaAddToCart, snapshot.gaViewItem),
    wooSalesToTrafficRatio: calculateRate(snapshot.wooUnits, snapshot.gaViewItem)
  };
  return next;
}

function calculateRate(value?: number | null, total?: number | null) {
  if (!value || !total || total === 0) return null;
  return value / total;
}

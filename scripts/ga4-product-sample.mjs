#!/usr/bin/env node
import "dotenv/config";
import process from "node:process";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const { GA4_CREDENTIALS_JSON, GA4_PROPERTY_ID } = process.env;
if (!GA4_CREDENTIALS_JSON || !GA4_PROPERTY_ID) {
  console.error("Missing GA4 env vars.");
  process.exit(1);
}

const client = new BetaAnalyticsDataClient({ credentials: JSON.parse(GA4_CREDENTIALS_JSON) });
const property = `properties/${GA4_PROPERTY_ID.trim()}`;

const sampleProducts = [
  { key: "rory-mcilroy", label: "Rory McIlroy", slug: "rory-mcilroy", wooProductId: 34135 },
  { key: "gary-payton", label: "Gary Payton", slug: "gary-payton", wooProductId: 69519 },
  { key: "kelly-slater", label: "Kelly Slater", slug: "kelly-slater", wooProductId: 64687 },
  { key: "bo-jackson", label: "Bo Jackson", slug: "bo-jackson", wooProductId: 32131 },
  { key: "eddie-vedder", label: "Eddie Vedder", slug: "eddie-vedder", wooProductId: 33668 },
  { key: "derek-jeter", label: "Derek Jeter", slug: "derek-jeter", wooProductId: 63407 },
  { key: "a-champions-release", label: "A Champion’s Release", slug: "a-champions-release", wooProductId: 103142 }
];

const ranges = [
  { label: "30d", startDate: "30daysAgo", endDate: "today" },
  { label: "365d", startDate: "365daysAgo", endDate: "today" }
];

const events = [
  { eventName: "page_view", metrics: ["eventCount"] },
  { eventName: "view_item", metrics: ["eventCount"] },
  { eventName: "add_to_cart", metrics: ["eventCount"] },
  { eventName: "begin_checkout", metrics: ["eventCount"] },
  { eventName: "purchase", metrics: ["eventCount", "purchaseRevenue"] }
];

const dimensions = ["pagePathPlusQueryString", "sessionSource", "sessionMedium"];

const requestedKey = process.argv[2] ?? null;

const productsToRun = requestedKey
  ? sampleProducts.filter((p) => p.key === requestedKey)
  : sampleProducts;

if (productsToRun.length === 0) {
  console.error(`No product matched key "${requestedKey}".`);
  process.exit(1);
}

function buildFilter(eventName, product) {
  const expressions = [
    {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: eventName }
      }
    }
  ];
  const productFilters = [];
  if (product.slug) {
    productFilters.push({
      filter: {
        fieldName: "pagePathPlusQueryString",
        stringFilter: { matchType: "CONTAINS", value: product.slug }
      }
    });
    productFilters.push({
      filter: {
        fieldName: "pageLocation",
        stringFilter: { matchType: "CONTAINS", value: product.slug }
      }
    });
  }
  if (product.label) {
    productFilters.push({
      filter: {
        fieldName: "pageTitle",
        stringFilter: { matchType: "CONTAINS", value: product.label }
      }
    });
  }

  if (productFilters.length) {
    expressions.push(productFilters.length === 1 ? productFilters[0] : { orGroup: { expressions: productFilters } });
  }

  return expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
}

async function runProduct(range, product, event) {
  try {
    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: event.metrics.map((name) => ({ name })),
      dimensionFilter: buildFilter(event.eventName, product),
      limit: 25,
      orderBys: [{ metric: { metricName: event.metrics[0] }, desc: true }]
    });

    const rows = (report.rows ?? []).map((row) => ({
      pagePath: row.dimensionValues?.[0]?.value ?? null,
      sessionSource: row.dimensionValues?.[1]?.value ?? null,
      sessionMedium: row.dimensionValues?.[2]?.value ?? null,
      metrics: row.metricValues?.map((m) => m.value ?? null) ?? []
    }));

    const eventCountIndex = 0;
    const revenueIndex = event.metrics.length > 1 ? 1 : null;

    const aggregate = rows.reduce((acc, row) => {
      const value = Number(row.metrics?.[eventCountIndex] ?? 0);
      acc.eventCount += value;
      if (revenueIndex !== null) {
        acc.purchaseRevenue += Number(row.metrics?.[revenueIndex] ?? 0);
      }
      return acc;
    }, { eventCount: 0, purchaseRevenue: 0 });

    return {
      ok: true,
      eventCount: aggregate.eventCount,
      purchaseRevenue: revenueIndex !== null ? aggregate.purchaseRevenue : undefined,
      samplePaths: rows.slice(0, 5)
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

(async () => {
  const output = {
    generatedAt: new Date().toISOString(),
    property,
    ranges: ranges.map((r) => r.label),
    products: {}
  };

  for (const product of productsToRun) {
    const productEntry = {
      label: product.label,
      slug: product.slug,
      wooProductId: product.wooProductId,
      ranges: {}
    };
    for (const range of ranges) {
      const rangeEntry = {};
      for (const event of events) {
        rangeEntry[event.eventName] = await runProduct(range, product, event);
      }
      productEntry.ranges[range.label] = rangeEntry;
    }
    output.products[product.key] = productEntry;
  }

  console.log(JSON.stringify(output, null, 2));
})();

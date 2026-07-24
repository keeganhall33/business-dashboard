#!/usr/bin/env node
import "dotenv/config";
import process from "node:process";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const { GA4_CREDENTIALS_JSON, GA4_PROPERTY_ID } = process.env;
if (!GA4_CREDENTIALS_JSON || !GA4_PROPERTY_ID) {
  console.error("GA4_CREDENTIALS_JSON and GA4_PROPERTY_ID env vars are required.");
  process.exit(1);
}

const client = new BetaAnalyticsDataClient({ credentials: JSON.parse(GA4_CREDENTIALS_JSON) });
const property = `properties/${GA4_PROPERTY_ID.trim()}`;

const ranges = [
  { label: "7d", startDate: "7daysAgo", endDate: "today" },
  { label: "30d", startDate: "30daysAgo", endDate: "today" },
  { label: "90d", startDate: "90daysAgo", endDate: "today" },
  { label: "365d", startDate: "365daysAgo", endDate: "today" }
];

const pageViewDimensions = [
  "pagePathPlusQueryString",
  "pageTitle",
  "pageLocation",
  "sessionSource",
  "sessionMedium",
  "sessionCampaignName"
];

const commerceDimensions = [
  "pagePathPlusQueryString",
  "sessionSource",
  "sessionMedium"
];

const fieldTests = [
  {
    key: "page_view_fields",
    label: "page_view dimensions",
    eventName: "page_view",
    dimensions: pageViewDimensions,
    metrics: ["eventCount"],
    limit: 50
  },
  {
    key: "view_item_fields",
    label: "view_item page mapping",
    eventName: "view_item",
    dimensions: commerceDimensions,
    metrics: ["eventCount"],
    limit: 50
  },
  {
    key: "add_to_cart_fields",
    label: "add_to_cart page mapping",
    eventName: "add_to_cart",
    dimensions: commerceDimensions,
    metrics: ["eventCount"],
    limit: 50
  },
  {
    key: "begin_checkout_fields",
    label: "begin_checkout page mapping",
    eventName: "begin_checkout",
    dimensions: commerceDimensions,
    metrics: ["eventCount"],
    limit: 50
  },
  {
    key: "purchase_fields",
    label: "purchase thank-you mapping",
    eventName: "purchase",
    dimensions: commerceDimensions,
    metrics: ["eventCount", "totalRevenue", "purchaseRevenue"],
    limit: 50
  }
];

const sampleProducts = [
  { key: "rory-mcilroy", label: "Rory McIlroy", slug: "rory-mcilroy", wooProductId: 34135 },
  { key: "gary-payton", label: "Gary Payton", slug: "gary-payton", wooProductId: 69519 },
  { key: "kelly-slater", label: "Kelly Slater", slug: "kelly-slater", wooProductId: 64687 },
  { key: "bo-jackson", label: "Bo Jackson", slug: "bo-jackson", wooProductId: 32131 },
  { key: "eddie-vedder", label: "Eddie Vedder", slug: "eddie-vedder", wooProductId: 33668 },
  { key: "derek-jeter", label: "Derek Jeter", slug: "derek-jeter", wooProductId: 63407 },
  { key: "a-champions-release", label: "A Champion’s Release", slug: "a-champions-release", wooProductId: 103142 }
];

const productEvents = ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"];

const output = {
  generatedAt: new Date().toISOString(),
  property,
  ranges: ranges.map((r) => r.label),
  fieldTests: [],
  productSamples: {}
};

function buildProductFilter(eventName, product) {
  const baseFilter = {
    filter: {
      fieldName: "eventName",
      stringFilter: { matchType: "EXACT", value: eventName }
    }
  };

  const productExpressions = [];
  if (product?.slug) {
    productExpressions.push({
      filter: {
        fieldName: "pagePathPlusQueryString",
        stringFilter: { matchType: "CONTAINS", value: product.slug }
      }
    });
    productExpressions.push({
      filter: {
        fieldName: "pageLocation",
        stringFilter: { matchType: "CONTAINS", value: product.slug }
      }
    });
  }
  if (product?.label) {
    productExpressions.push({
      filter: {
        fieldName: "pageTitle",
        stringFilter: { matchType: "CONTAINS", value: product.label }
      }
    });
  }

  if (productExpressions.length === 0) {
    return baseFilter;
  }

  const productFilter = productExpressions.length === 1
    ? productExpressions[0]
    : { orGroup: { expressions: productExpressions } };

  return {
    andGroup: {
      expressions: [baseFilter, productFilter]
    }
  };
}

async function runFieldTest(range, config) {
  try {
    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: config.dimensions.map((name) => ({ name })),
      metrics: config.metrics.map((name) => ({ name })),
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: config.eventName }
        }
      },
      limit: config.limit ?? 100,
      orderBys: [{ metric: { metricName: config.metrics[0] }, desc: true }]
    });

    const rows = (report.rows ?? []).map((row) => ({
      dimensions: row.dimensionValues?.map((d) => d.value ?? null) ?? [],
      metrics: row.metricValues?.map((m) => m.value ?? null) ?? []
    }));

    return {
      ok: true,
      rowCount: rows.length,
      sample: rows.slice(0, 10)
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runProductEvent(range, eventName, product) {
  try {
    const metrics = eventName === "purchase"
      ? [{ name: "eventCount" }, { name: "purchaseRevenue" }]
      : [{ name: "eventCount" }];

    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: commerceDimensions.map((name) => ({ name })),
      metrics,
      dimensionFilter: buildProductFilter(eventName, product),
      limit: 100,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }]
    });

    const rows = (report.rows ?? []).map((row) => ({
      pagePath: row.dimensionValues?.[0]?.value ?? null,
      sessionSource: row.dimensionValues?.[1]?.value ?? null,
      sessionMedium: row.dimensionValues?.[2]?.value ?? null,
      eventCount: Number(row.metricValues?.[0]?.value ?? 0),
      purchaseRevenue: metrics.length > 1 ? Number(row.metricValues?.[1]?.value ?? 0) : null
    }));

    const aggregated = rows.reduce((acc, row) => {
      acc.eventCount += row.eventCount ?? 0;
      if (typeof row.purchaseRevenue === "number") {
        acc.purchaseRevenue += row.purchaseRevenue;
      }
      if (!acc.primaryMatch && row.eventCount > 0) {
        acc.primaryMatch = {
          pagePath: row.pagePath,
          sessionSource: row.sessionSource,
          sessionMedium: row.sessionMedium
        };
      }
      return acc;
    }, { eventCount: 0, purchaseRevenue: 0, primaryMatch: null });

    return {
      ok: true,
      rowCount: rows.length,
      eventCount: aggregated.eventCount,
      purchaseRevenue: metrics.length > 1 ? aggregated.purchaseRevenue : undefined,
      primaryMatch: aggregated.primaryMatch,
      sampleRows: rows.slice(0, 5)
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

(async () => {
  for (const range of ranges) {
    for (const test of fieldTests) {
      const result = await runFieldTest(range, test);
      output.fieldTests.push({
        range: range.label,
        eventName: test.eventName,
        key: test.key,
        ok: result.ok,
        rowCount: result.rowCount,
        sample: result.sample,
        error: result.error ?? null
      });
    }
  }

  for (const product of sampleProducts) {
    const productEntry = {
      label: product.label,
      slug: product.slug,
      wooProductId: product.wooProductId,
      ranges: {}
    };
    for (const range of ranges) {
      const rangeEntry = {};
      for (const eventName of productEvents) {
        rangeEntry[eventName] = await runProductEvent(range, eventName, product);
      }
      productEntry.ranges[range.label] = rangeEntry;
    }
    output.productSamples[product.key] = productEntry;
  }

  console.log(JSON.stringify(output, null, 2));
})();

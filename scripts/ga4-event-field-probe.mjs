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

const ranges = [
  { label: "7d", startDate: "7daysAgo", endDate: "today" },
  { label: "30d", startDate: "30daysAgo", endDate: "today" },
  { label: "90d", startDate: "90daysAgo", endDate: "today" },
  { label: "365d", startDate: "365daysAgo", endDate: "today" }
];

const pageViewDims = ["pagePathPlusQueryString", "pageTitle", "pageLocation", "sessionSource", "sessionMedium", "sessionCampaignName"];
const commerceDims = ["pagePathPlusQueryString", "sessionSource", "sessionMedium"];

const events = [
  { eventName: "page_view", label: "Page views", dimensions: pageViewDims, metrics: ["eventCount"] },
  { eventName: "view_item", label: "Product views", dimensions: commerceDims, metrics: ["eventCount"] },
  { eventName: "add_to_cart", label: "Adds to cart", dimensions: commerceDims, metrics: ["eventCount"] },
  { eventName: "begin_checkout", label: "Checkout starts", dimensions: commerceDims, metrics: ["eventCount"] },
  { eventName: "purchase", label: "Purchases", dimensions: commerceDims, metrics: ["eventCount", "purchaseRevenue"] }
];

const output = {
  generatedAt: new Date().toISOString(),
  property,
  ranges: ranges.map((r) => r.label),
  events: {}
};

async function runEvent(range, event) {
  const [report] = await client.runReport({
    property,
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: event.dimensions.map((name) => ({ name })),
    metrics: event.metrics.map((name) => ({ name })),
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: event.eventName }
      }
    },
    limit: 25,
    orderBys: [{ metric: { metricName: event.metrics[0] }, desc: true }]
  });

  const rows = (report.rows ?? []).map((row) => ({
    dimensions: row.dimensionValues?.map((d) => d.value ?? null) ?? [],
    metrics: row.metricValues?.map((m) => m.value ?? null) ?? []
  }));

  return {
    rowCount: rows.length,
    sample: rows,
    dimensionHeaders: report.dimensionHeaders?.map((header) => header.name) ?? [],
    metricHeaders: report.metricHeaders?.map((header) => header.name) ?? []
  };
}

(async () => {
  for (const range of ranges) {
    output.events[range.label] = {};
    for (const event of events) {
      try {
        output.events[range.label][event.eventName] = await runEvent(range, event);
      } catch (error) {
        output.events[range.label][event.eventName] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  console.log(JSON.stringify(output, null, 2));
})();

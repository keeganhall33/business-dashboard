#!/usr/bin/env node
import "dotenv/config";
import process from "node:process";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const { GA4_CREDENTIALS_JSON, GA4_PROPERTY_ID } = process.env;

if (!GA4_CREDENTIALS_JSON || !GA4_PROPERTY_ID) {
  console.error("GA4_CREDENTIALS_JSON and GA4_PROPERTY_ID env vars are required for this test.");
  process.exit(1);
}

const credentials = JSON.parse(GA4_CREDENTIALS_JSON);
const client = new BetaAnalyticsDataClient({ credentials });
const property = `properties/${GA4_PROPERTY_ID.trim()}`;

const ranges = [
  { label: "7d", startDate: "7daysAgo", endDate: "today" },
  { label: "30d", startDate: "30daysAgo", endDate: "today" }
];

const EVENT_NAMES = [
  { label: "view_item", eventName: "view_item" },
  { label: "add_to_cart", eventName: "add_to_cart" },
  { label: "begin_checkout", eventName: "begin_checkout" },
  { label: "purchase", eventName: "purchase" }
];

const FAILED_METRICS = [
  { label: "addToCartEvents", metricName: "addToCartEvents" },
  { label: "beginCheckoutEvents", metricName: "beginCheckoutEvents" }
];

async function runMetric(range, metricName) {
  try {
    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      metrics: [{ name: metricName }]
    });
    const value = Number(report.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runEventCount(range, eventName) {
  try {
    const [report] = await client.runReport({
      property,
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          stringFilter: { matchType: "EXACT", value: eventName }
        }
      }
    });
    const value = Number(report.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  for (const range of ranges) {
    console.log(`\n=== GA4 event counts (${range.label}) ===`);

    for (const metric of FAILED_METRICS) {
      const result = await runMetric(range, metric.metricName);
      if (result.ok) {
        console.log(`metric ${metric.metricName}: ${result.value}`);
      } else {
        console.log(`metric ${metric.metricName} FAILED: ${result.error}`);
      }
    }

    for (const event of EVENT_NAMES) {
      const result = await runEventCount(range, event.eventName);
      if (result.ok) {
        console.log(`eventCount(${event.eventName}) = ${result.value}`);
      } else {
        console.log(`eventCount(${event.eventName}) FAILED: ${result.error}`);
      }
    }
  }
}

await main();

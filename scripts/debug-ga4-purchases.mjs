#!/usr/bin/env node
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const credentialRaw = process.env.GA4_CREDENTIALS_JSON;
const propertyId = process.env.GA4_PROPERTY_ID;
if (!credentialRaw || !propertyId) {
  console.error("Missing GA4 credentials env vars.");
  process.exit(1);
}

const client = new BetaAnalyticsDataClient({ credentials: JSON.parse(credentialRaw) });

const ranges = [
  { label: "7d", startDate: "7daysAgo", endDate: "today" },
  { label: "30d", startDate: "30daysAgo", endDate: "today" }
];

async function fetchPurchases(range) {
  const [report] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "eventName" }, { name: "transactionId" }, { name: "date" }],
    metrics: [{ name: "purchaseRevenue" }, { name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: "purchase" }
      }
    },
    limit: 250
  });

  return (report.rows ?? []).map((row) => ({
    transactionId: row.dimensionValues?.[1]?.value || null,
    date: row.dimensionValues?.[2]?.value || null,
    eventCount: Number(row.metricValues?.[1]?.value ?? 0),
    purchaseRevenue: Number(row.metricValues?.[0]?.value ?? 0)
  }));
}

(async () => {
  for (const range of ranges) {
    const rows = await fetchPurchases(range);
    console.log(`\nGA4 purchases ${range.label} (rows=${rows.length}):`);
    console.log(rows);
  }
})();

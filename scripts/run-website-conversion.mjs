#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fetch from 'node-fetch';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const REQUIRED_ENV_VARS = [
  'GA4_CREDENTIALS_JSON',
  'GA4_PROPERTY_ID',
  'WOO_BASE_URL',
  'WOO_CONSUMER_KEY',
  'WOO_CONSUMER_SECRET'
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[website-agent] Missing env var: ${key}`);
    process.exit(1);
  }
}

const ga4CredentialRaw = process.env.GA4_CREDENTIALS_JSON.trim();
const propertyId = process.env.GA4_PROPERTY_ID;
const wooBaseUrl = process.env.WOO_BASE_URL.replace(/\/$/, '');
const wooKey = process.env.WOO_CONSUMER_KEY;
const wooSecret = process.env.WOO_CONSUMER_SECRET;

const agentOutputPath = path.resolve('../dashboard/data/website/latest.json');
const agentLogPath = path.resolve('../dashboard/logs/website_agent.log');

function baseLog(payload) {
  return fs.appendFile(
    agentLogPath,
    JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n'
  );
}

function buildGa4RequestPayload() {
  return {
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'eventCount' },
      { name: 'addToCartEvents' },
      { name: 'ecommercePurchases' },
      { name: 'purchaseRevenue' }
    ],
    dimensions: [
      { name: 'deviceCategory' },
      { name: 'sessionDefaultChannelGroup' }
    ]
  };
}

async function fetchGA4WithServiceAccount() {
const credentialJson = JSON.parse(ga4CredentialRaw);
const client = new BetaAnalyticsDataClient({ credentials: credentialJson });

const warnings = [];

const [baseReport] = await client.runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
  metrics: [
    { name: 'totalUsers' },
    { name: 'sessions' },
    { name: 'eventCount' },
    { name: 'ecommercePurchases' },
    { name: 'purchaseRevenue' }
  ]
});

async function fetchBreakdown(dimensionName) {
  try {
    const [report] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: dimensionName }],
      metrics: [{ name: 'sessions' }]
    });
    return (report.rows ?? []).map((row) => ({
      label: row.dimensionValues?.[0]?.value,
      sessions: Number(row.metricValues?.[0]?.value ?? 0)
    }));
  } catch (error) {
    warnings.push(`${dimensionName} unavailable: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function fetchAddToCartEvents() {
  try {
    const [directMetric] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'addToCartEvents' }]
    });
    const directValue = Number(directMetric.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    if (!Number.isNaN(directValue) && directValue) return directValue;

    const [eventFilterReport] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: 'add_to_cart' }
        }
      }
    });
    return Number(eventFilterReport.rows?.[0]?.metricValues?.[0]?.value ?? 0);
  } catch (error) {
    warnings.push(`addToCartEvents unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const [deviceBreakdown, channelBreakdown, addToCartEvents] = await Promise.all([
  fetchBreakdown('deviceCategory'),
  fetchBreakdown('sessionDefaultChannelGroup'),
  fetchAddToCartEvents()
]);

return { baseReport, deviceBreakdown, channelBreakdown, addToCartEvents, warnings };
}

async function fetchGA4WithApiKey() {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport?key=${ga4CredentialRaw}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGa4RequestPayload())
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GA4 API key call failed: ${response.status} ${response.statusText} ${text}`);
  }

  return await response.json();
}

function normalizeGa4Response(summary) {
  const metricValues = summary.rows?.[0]?.metricValues ?? [];
  const toNumber = (index) => Number(metricValues[index]?.value ?? 0);

  return {
    totalUsers: toNumber(0),
    sessions: toNumber(1),
    eventCount: toNumber(2),
    addToCartEvents: toNumber(3),
    ecommercePurchases: toNumber(4),
    purchaseRevenue: Number(metricValues[5]?.value ?? 0),
    deviceBreakdown: (summary.rows ?? []).map((row) => ({
      deviceCategory: row.dimensionValues?.[0]?.value,
      channelGroup: row.dimensionValues?.[1]?.value,
      sessions: Number(row.metricValues?.[1]?.value ?? 0)
    }))
  };
}

async function fetchGA4Summary() {
  const looksLikeJson = ga4CredentialRaw.trim().startsWith('{');
  if (!looksLikeJson) {
    return normalizeGa4Response(await fetchGA4WithApiKey());
  }

  const { baseReport, deviceBreakdown, channelBreakdown, addToCartEvents, warnings } =
    await fetchGA4WithServiceAccount();
  const normalized = normalizeGa4Response(baseReport);
  return {
    ...normalized,
    addToCartEvents,
    deviceBreakdown,
    channelBreakdown,
    warnings
  };
}

async function fetchWooCommerceSummary() {
  const auth = Buffer.from(`${wooKey}:${wooSecret}`).toString('base64');
  const response = await fetch(
    `${wooBaseUrl}/wp-json/wc/v3/orders?per_page=50&status=completed`,
    {
      headers: {
        Authorization: `Basic ${auth}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`WooCommerce API failed: ${response.status} ${response.statusText}`);
  }

  const orders = await response.json();
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
  const productMap = new Map();

  for (const order of orders) {
    for (const item of order.line_items ?? []) {
      const current = productMap.get(item.name) ?? { units: 0, revenue: 0 };
      current.units += item.quantity ?? 0;
      current.revenue += Number(item.total ?? 0);
      productMap.set(item.name, current);
    }
  }

  const topProducts = [...productMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const orderSummaries = orders.slice(0, 10).map((order) => ({
    id: order.id,
    status: order.status,
    total: Number(order.total),
    currency: order.currency,
    date: order.date_created,
    customer: order.billing?.first_name || order.billing?.last_name ?
      `${order.billing?.first_name ?? ''} ${order.billing?.last_name ?? ''}`.trim() : 'Unknown'
  }));

  return {
    totalRevenue,
    orderCount: orders.length,
    averageOrderValue: orders.length ? totalRevenue / orders.length : 0,
    topProducts,
    recentOrders: orderSummaries
  };
}

async function main() {
  try {
    const [ga4Summary, wooSummary] = await Promise.all([
      fetchGA4Summary(),
      fetchWooCommerceSummary()
    ]);

    const output = {
      generatedAt: new Date().toISOString(),
      ga4: ga4Summary,
      wooCommerce: wooSummary
    };

    await fs.mkdir(path.dirname(agentOutputPath), { recursive: true });
    await fs.writeFile(agentOutputPath, JSON.stringify(output, null, 2));

    await baseLog({ status: 'success', orders: wooSummary.orderCount, sessions: ga4Summary.sessions });
    console.log('[website-agent] Updated website metrics snapshot');
  } catch (error) {
    const friendlyMessage = error instanceof Error ? error.message : String(error);
    await baseLog({
      status: 'error',
      message: friendlyMessage,
      stack: error instanceof Error && error.stack ? error.stack : undefined
    });
    console.error('[website-agent] Failed:', friendlyMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await main();

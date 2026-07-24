#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import fetch from 'node-fetch';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || process.env.WEBSITE_AGENT_DRY_RUN === '1';

const REQUIRED_ENV_VARS = [
  'GA4_CREDENTIALS_JSON',
  'GA4_PROPERTY_ID',
  'WOO_BASE_URL',
  'WOO_CONSUMER_KEY',
  'WOO_CONSUMER_SECRET'
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error(`[website-agent] Missing env var: ${key}`);
    process.exit(1);
  }
}

const ga4CredentialRaw = process.env.GA4_CREDENTIALS_JSON.trim();
const propertyIdRaw = process.env.GA4_PROPERTY_ID.trim();
const propertyIdIsNumeric = /^\d+$/.test(propertyIdRaw);
console.log(
  `[website-agent] GA4 property id detected (present=${Boolean(propertyIdRaw)}, len=${propertyIdRaw.length}, numeric=${propertyIdIsNumeric})`
);
const propertyId = propertyIdRaw;
const wooBaseUrl = process.env.WOO_BASE_URL.replace(/\/$/, '');
const wooKey = process.env.WOO_CONSUMER_KEY;
const wooSecret = process.env.WOO_CONSUMER_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
if (!supabaseEnabled) {
  console.warn(
    `[website-agent] Supabase env missing; urlPresent=${Boolean(supabaseUrl)} keyPresent=${Boolean(supabaseServiceRoleKey)} - skipping remote snapshot upsert`
  );
}
const supabaseClient = supabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const agentOutputPath = path.join(repoRoot, 'dashboard', 'data', 'website', 'latest.json');
const agentLogPath = path.join(repoRoot, 'dashboard', 'logs', 'website_agent.log');
const dryRunArtifactPath = path.join(path.dirname(agentOutputPath), 'latest.dry-run.json');

const GA4_DATE_RANGE = { startDate: '7daysAgo', endDate: 'today' };
const REQUIRED_GA4_METRICS = [
  'totalUsers',
  'sessions',
  'eventCount',
  'ecommercePurchases',
  'purchaseRevenue'
];

function baseLog(payload) {
  return fs.mkdir(path.dirname(agentLogPath), { recursive: true })
    .then(() => fs.appendFile(
      agentLogPath,
      JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n'
    ));
}

async function sendSchedulerAlert(payload) {
  const secret = process.env.SCHEDULER_SECRET?.trim();
  const url = process.env.SCHEDULER_ALERT_URL?.trim();
  if (!secret || !url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-scheduler-secret': secret
      },
      body: JSON.stringify({ agentKey: 'website_conversion', ...payload })
    });
  } catch (error) {
    console.warn('[website-agent] Failed to send scheduler alert:', error instanceof Error ? error.message : error);
  }
}

function buildGa4RequestPayload() {
  return {
    dateRanges: [GA4_DATE_RANGE],
    metrics: REQUIRED_GA4_METRICS.map((name) => ({ name })),
    dimensions: [
      { name: 'deviceCategory' },
      { name: 'sessionDefaultChannelGroup' }
    ]
  };
}

async function upsertSupabaseSnapshot(snapshot, mode) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from('dashboard_snapshots')
      .upsert({
        key: 'website',
        payload: snapshot,
        mode: mode ?? snapshot?.status ?? null,
        generated_at: typeof snapshot?.generatedAt === 'string' ? snapshot.generatedAt : null
      });
    if (error) {
      console.error('[website-agent] Supabase snapshot upsert failed:', error.message);
      await baseLog({ status: 'warning', message: `supabase upsert failed: ${error.message}` });
    } else {
      console.log('[website-agent] Supabase dashboard snapshot updated (website)');
    }
  } catch (error) {
    console.error('[website-agent] Supabase snapshot upsert threw:', error instanceof Error ? error.message : error);
  }
}

async function fetchGA4WithServiceAccount() {
const credentialJson = JSON.parse(ga4CredentialRaw);
const client = new BetaAnalyticsDataClient({ credentials: credentialJson });

const warnings = [];

const baseReportRequest = {
  property: `properties/${propertyId}`,
  dateRanges: [GA4_DATE_RANGE],
  metrics: REQUIRED_GA4_METRICS.map((name) => ({ name }))
};

console.log('[website-agent] GA4 request metrics:', baseReportRequest.metrics.map((m) => m.name));

let baseReport;
try {
  [baseReport] = await client.runReport(baseReportRequest);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  const metadata = error && typeof error === 'object' && 'metadata' in error ? error.metadata : undefined;
  console.error('[website-agent] GA4 runReport failed:', detail, metadata ? JSON.stringify(metadata) : '');
  throw error;
}

async function fetchBreakdown(dimensionName) {
  try {
    const [report] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [GA4_DATE_RANGE],
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

async function fetchEventCount(eventName) {
  try {
    const [report] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [GA4_DATE_RANGE],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: eventName }
        }
      }
    });
    return Number(report.rows?.[0]?.metricValues?.[0]?.value ?? 0);
  } catch (error) {
    warnings.push(`${eventName} events unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const [deviceBreakdown, channelBreakdown, viewItemEvents, addToCartEvents, beginCheckoutEvents, purchaseEvents] = await Promise.all([
  fetchBreakdown('deviceCategory'),
  fetchBreakdown('sessionDefaultChannelGroup'),
  fetchEventCount('view_item'),
  fetchEventCount('add_to_cart'),
  fetchEventCount('begin_checkout'),
  fetchEventCount('purchase')
]);

return { baseReport, deviceBreakdown, channelBreakdown, addToCartEvents, beginCheckoutEvents, viewItemEvents, purchaseEvents, warnings };
}

async function fetchGA4WithApiKey() {
  return runGa4ApiKeyReport(buildGa4RequestPayload());
}

async function runGa4ApiKeyReport(body) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport?key=${ga4CredentialRaw}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GA4 API key call failed: ${response.status} ${response.statusText} ${text}`);
  }

  return await response.json();
}

async function fetchEventCountWithApiKey(eventName, label) {
  try {
    const response = await runGa4ApiKeyReport({
      dateRanges: [GA4_DATE_RANGE],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'EXACT', value: eventName }
        }
      }
    });
    return { value: Number(response.rows?.[0]?.metricValues?.[0]?.value ?? 0) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, warning: `${label} events unavailable: ${message}` };
  }
}

function normalizeGa4Response(summary) {
  const metricValues = summary.rows?.[0]?.metricValues ?? [];
  const toNumber = (index) => Number(metricValues[index]?.value ?? 0);

  return {
    totalUsers: toNumber(0),
    sessions: toNumber(1),
    eventCount: toNumber(2),
    ecommercePurchases: toNumber(3),
    purchaseRevenue: Number(metricValues[4]?.value ?? 0),
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
    const warnings = [];
    const summary = await fetchGA4WithApiKey();
    const normalized = normalizeGa4Response(summary);
    const { value: addToCartEvents, warning } = await fetchEventCountWithApiKey('add_to_cart', 'add_to_cart');
    const { value: viewItemEvents, warning: viewWarning } = await fetchEventCountWithApiKey('view_item', 'view_item');
    const { value: beginCheckoutEvents, warning: beginWarning } = await fetchEventCountWithApiKey('begin_checkout', 'begin_checkout');
    const { value: purchaseEvents, warning: purchaseWarning } = await fetchEventCountWithApiKey('purchase', 'purchase');
    if (warning) warnings.push(warning);
    if (viewWarning) warnings.push(viewWarning);
    if (beginWarning) warnings.push(beginWarning);
    if (purchaseWarning) warnings.push(purchaseWarning);
    return {
      ...normalized,
      viewItemEvents,
      addToCartEvents,
      beginCheckoutEvents,
      purchaseEvents,
      warnings
    };
  }

  const { baseReport, deviceBreakdown, channelBreakdown, addToCartEvents, beginCheckoutEvents, viewItemEvents, purchaseEvents, warnings } =
    await fetchGA4WithServiceAccount();
  const normalized = normalizeGa4Response(baseReport);
  return {
    ...normalized,
    viewItemEvents,
    addToCartEvents,
    purchaseEvents,
    beginCheckoutEvents,
    deviceBreakdown,
    channelBreakdown,
    warnings
  };
}

const WOO_LOOKBACK_DAYS = Number(process.env.WOO_LOOKBACK_DAYS ?? "7");

function buildWindowBounds(days) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchWooCommerceSummary() {
  const auth = Buffer.from(`${wooKey}:${wooSecret}`).toString('base64');
  const windowDays = Number.isFinite(WOO_LOOKBACK_DAYS) && WOO_LOOKBACK_DAYS > 0 ? Math.floor(WOO_LOOKBACK_DAYS) : 7;
  const { start: windowStart, end: windowEnd } = buildWindowBounds(windowDays);
  const params = new URLSearchParams({
    per_page: '100',
    status: 'completed',
    orderby: 'date',
    order: 'desc',
    after: windowStart.toISOString()
  });
  const response = await fetch(`${wooBaseUrl}/wp-json/wc/v3/orders?${params.toString()}`, {
    headers: {
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    throw new Error(`WooCommerce API failed: ${response.status} ${response.statusText}`);
  }

  const orders = await response.json();
  const filteredOrders = orders.filter((order) => {
    const completedIso = order.date_completed_gmt ?? order.date_completed ?? order.date_created_gmt ?? order.date_created;
    if (!completedIso) return false;
    const completedDate = new Date(completedIso);
    return completedDate >= windowStart && completedDate <= windowEnd;
  });
  const totalRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const productMap = new Map();

  for (const order of filteredOrders) {
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

  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();

  return {
    totalRevenue,
    orderCount: filteredOrders.length,
    averageOrderValue: filteredOrders.length ? totalRevenue / filteredOrders.length : 0,
    rangeDays: windowDays,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
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

    if (!DRY_RUN) {
      await fs.mkdir(path.dirname(agentOutputPath), { recursive: true });
      console.log(`[website-agent] Writing snapshot to ${agentOutputPath}`);
      await fs.writeFile(agentOutputPath, JSON.stringify(output, null, 2));

      await baseLog({ status: 'success', orders: wooSummary.orderCount, sessions: ga4Summary.sessions });
      await sendSchedulerAlert({
        status: 'success',
        message: 'Website agent completed',
        orders: wooSummary.orderCount,
        sessions: ga4Summary.sessions
      });
    } else {
      await fs.mkdir(path.dirname(dryRunArtifactPath), { recursive: true });
      await fs.writeFile(dryRunArtifactPath, JSON.stringify(output, null, 2));
    }
    const conversionRate =
      ga4Summary?.sessions && ga4Summary.sessions > 0 && ga4Summary?.purchaseEvents != null
        ? ((ga4Summary.purchaseEvents / ga4Summary.sessions) * 100).toFixed(2)
        : 'n/a';
    const websiteStatus = ga4Summary && wooSummary ? 'LIVE' : ga4Summary || wooSummary ? 'PARTIAL' : 'BROKEN';
    output.status = websiteStatus;
    if (!DRY_RUN) {
      await upsertSupabaseSnapshot(output, websiteStatus);
    }

    console.log(
      `[website-agent] Summary: generatedAt=${output.generatedAt} ga4.users=${ga4Summary?.totalUsers ?? 'n/a'} ga4.sessions=${
        ga4Summary?.sessions ?? 'n/a'
      } ga4.purchase_events=${ga4Summary?.purchaseEvents ?? 'n/a'} ga4.add_to_cart=${
        ga4Summary?.addToCartEvents ?? 'n/a'
      } ga4.begin_checkout=${ga4Summary?.beginCheckoutEvents ?? 'n/a'} ga4.conversion_rate=${conversionRate}% woo.revenue=${
        wooSummary.totalRevenue ?? 'n/a'
      } woo.orders=${wooSummary.orderCount ?? 'n/a'} woo.aov=${wooSummary.averageOrderValue ?? 'n/a'} status=${websiteStatus}`
    );
    if (DRY_RUN) {
      console.log('[website-agent] DRY RUN complete — wrote dry-run artifact only (dashboard/data/website/latest.dry-run.json). No production snapshot or Supabase write occurred.');
    } else {
      console.log('[website-agent] Updated website metrics snapshot');
    }
  } catch (error) {
    const friendlyMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error && typeof error === 'object' && 'details' in error ? error.details : undefined;
    const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const diagnostic = { message: friendlyMessage, details: errorDetails, code: errorCode };

    if (!DRY_RUN) {
      await baseLog({
        status: 'error',
        ...diagnostic,
        stack: error instanceof Error && error.stack ? error.stack : undefined
      });
      await sendSchedulerAlert({ status: 'error', message: friendlyMessage });
    }

    const failureOutput = {
      generatedAt: new Date().toISOString(),
      status: 'BROKEN',
      error: diagnostic
    };
    if (!DRY_RUN) {
      await fs.mkdir(path.dirname(agentOutputPath), { recursive: true });
      await fs.writeFile(agentOutputPath, JSON.stringify(failureOutput, null, 2));
      await upsertSupabaseSnapshot(failureOutput, 'BROKEN');
    }

    if (!DRY_RUN) {
      try {
        const snapshotExists = await fs
          .access(agentOutputPath)
          .then(() => true)
          .catch(() => false);
        const logExists = await fs
          .access(agentLogPath)
          .then(() => true)
          .catch(() => false);
        console.error('[website-agent] Failure artifacts', {
          cwd: process.cwd(),
          snapshotExists,
          logExists,
          snapshotPath: agentOutputPath,
          logPath: agentLogPath
        });
      } catch (artifactError) {
        console.error('[website-agent] Artifact existence check failed', artifactError);
      }
    }

    console.error('[website-agent] Failed:', friendlyMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await main();

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fetch from 'node-fetch';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

const repoRoot = process.cwd();
const agentOutputPath = path.join(repoRoot, 'dashboard', 'data', 'website', 'latest.json');
const agentLogPath = path.join(repoRoot, 'dashboard', 'logs', 'website_agent.log');

const GA4_DATE_RANGE = { startDate: '6daysAgo', endDate: 'today' };
const REQUIRED_GA4_METRICS = [
  'totalUsers',
  'sessions',
  'eventCount',
  'ecommercePurchases',
  'purchaseRevenue'
];
const GA4_EVENT_FIELD_MAP = {
  view_item: 'viewItemEvents',
  add_to_cart: 'addToCartEvents',
  begin_checkout: 'beginCheckoutEvents',
  purchase: 'purchaseEvents'
};
const REQUIRED_GA4_EVENTS = Object.keys(GA4_EVENT_FIELD_MAP);
const WOO_PAGE_SIZE = 100;
const WOO_MAX_PAGES = 10;
const REPORTING_TIMEZONE = 'America/Los_Angeles';
const REPORTING_RANGE_DAYS = 7;
const REPORTING_LABEL = 'Rolling 7 days';

const apiCallCounts = {
  ga4: 0,
  wooOrders: 0,
  wooRefunds: 0
};

const DAY_MS = 24 * 60 * 60 * 1000;

const pacificDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTING_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const pacificDateTimePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORTING_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sumNumeric(collection, selector) {
  if (!Array.isArray(collection) || !collection.length) return 0;
  return collection.reduce((sum, item, index) => {
    const value = selector(item, index);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function getPacificCalendarDate(date) {
  const parts = pacificDateFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function shiftPacificDate(parts, deltaDays) {
  const anchorUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
  const shifted = new Date(anchorUtc + deltaDays * DAY_MS);
  return getPacificCalendarDate(shifted);
}

function getLocalizedDateTimeParts(date) {
  return pacificDateTimePartsFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

function getTimeZoneOffsetMinutes(date) {
  const parts = getLocalizedDateTimeParts(date);
  const required = ['year', 'month', 'day', 'hour', 'minute', 'second'];
  for (const key of required) {
    if (!(key in parts)) {
      throw new Error(`Unable to resolve localized date part: ${key}`);
    }
  }
  const localMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (localMs - date.getTime()) / 60000;
}

function createPacificInstant(year, month, day, hour = 0, minute = 0, second = 0) {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs));
  const utcMs = guessUtcMs - offsetMinutes * 60 * 1000;
  return new Date(utcMs);
}

function formatPacificDate(date) {
  return pacificDateFormatter.format(date);
}

function computeReportingWindow(now = new Date()) {
  const todayParts = getPacificCalendarDate(now);
  const startParts = shiftPacificDate(todayParts, -(REPORTING_RANGE_DAYS - 1));
  const endExclusiveParts = shiftPacificDate(todayParts, 1);
  const todayInstant = createPacificInstant(todayParts.year, todayParts.month, todayParts.day);
  const startInstant = createPacificInstant(startParts.year, startParts.month, startParts.day);
  const endInstantExclusive = createPacificInstant(endExclusiveParts.year, endExclusiveParts.month, endExclusiveParts.day);
  return {
    timezone: REPORTING_TIMEZONE,
    rangeDays: REPORTING_RANGE_DAYS,
    label: REPORTING_LABEL,
    startInstant,
    endInstantExclusive,
    startDateText: formatPacificDate(startInstant),
    endDateText: formatPacificDate(todayInstant),
    localStartDate: formatPacificDate(startInstant),
    localEndDateExclusive: formatPacificDate(endInstantExclusive),
    windowStartUtc: startInstant.toISOString(),
    windowEndExclusiveUtc: endInstantExclusive.toISOString()
  };
}

function roundCurrency(value) {
  const numericValue = toNumber(value, 0);
  return Math.round(numericValue * 100) / 100;
}

function roundRatio(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function buildEventCountRecord(defaultValue) {
  return Object.values(GA4_EVENT_FIELD_MAP).reduce((acc, field) => {
    acc[field] = defaultValue;
    return acc;
  }, {});
}

function mapEventRowsToCounts(rows, defaultValue = 0) {
  const counts = buildEventCountRecord(defaultValue);
  for (const row of rows ?? []) {
    const eventName = row?.dimensionValues?.[0]?.value;
    if (!eventName) continue;
    const fieldName = GA4_EVENT_FIELD_MAP[eventName];
    if (!fieldName) continue;
    const metricValue = row?.metricValues?.[0]?.value;
    counts[fieldName] = toNumber(metricValue, defaultValue);
  }
  return counts;
}

function baseLog(payload) {
  return fs.mkdir(path.dirname(agentLogPath), { recursive: true })
    .then(() => fs.appendFile(
      agentLogPath,
      JSON.stringify({ timestamp: new Date().toISOString(), ...payload }) + '\n'
    ));
}

async function fetchWooCollection(resource, params, counterKey, auth) {
  const items = [];
  let page = 1;
  while (true) {
    params.set('page', String(page));
    params.set('per_page', String(WOO_PAGE_SIZE));
    const url = `${wooBaseUrl}/wp-json/wc/v3/${resource}?${params.toString()}`;
    apiCallCounts[counterKey] += 1;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    if (!response.ok) {
      throw new Error(`WooCommerce API failed (${resource}): ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      items.push(...data);
    }
    const totalPages = Number(response.headers.get('x-wp-totalpages')) || 1;
    if (page >= totalPages) break;
    page += 1;
    if (page > WOO_MAX_PAGES) {
      await baseLog({ status: 'warning', message: `${resource} pagination truncated at ${WOO_MAX_PAGES} pages` });
      break;
    }
  }
  return items;
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

function buildHistoryPayload(snapshot) {
  if (!snapshot) return null;
  const { ga4, wooCommerce, ga4Window, wooWindow, windowStart, windowEnd, generatedAt } = snapshot;
  const funnelRates = computeFunnelRates(ga4);
  const safePayload = {
    ga4: {
      totalUsers: ga4?.totalUsers ?? null,
      sessions: ga4?.sessions ?? null,
      eventCount: ga4?.eventCount ?? null,
      ecommercePurchases: ga4?.ecommercePurchases ?? null,
      purchaseRevenue: ga4?.purchaseRevenue ?? null,
      viewItemEvents: ga4?.viewItemEvents ?? null,
      addToCartEvents: ga4?.addToCartEvents ?? null,
      beginCheckoutEvents: ga4?.beginCheckoutEvents ?? null,
      purchaseEvents: ga4?.purchaseEvents ?? null,
      channelBreakdown: ga4?.channelBreakdown ?? [],
      deviceBreakdown: ga4?.deviceBreakdown ?? [],
      warnings: ga4?.warnings ?? [],
      funnelRates
    },
    wooCommerce: {
      paidOrdersInWindow: wooCommerce?.paidOrdersInWindow ?? null,
      grossOrderRevenue: wooCommerce?.grossOrderRevenue ?? null,
      merchandiseRevenue: wooCommerce?.merchandiseRevenue ?? null,
      shippingRevenue: wooCommerce?.shippingRevenue ?? null,
      taxCollected: wooCommerce?.taxCollected ?? null,
      discountTotal: wooCommerce?.discountTotal ?? null,
      netRevenue: wooCommerce?.netRevenue ?? null,
      grossAov: wooCommerce?.grossAov ?? null,
      netAov: wooCommerce?.netAov ?? null,
      refundTotal: wooCommerce?.refundTotal ?? null,
      refundCount: wooCommerce?.refundCount ?? null,
      refundDefinition: wooCommerce?.refundDefinition ?? null,
      refundDataComplete: wooCommerce?.refundDataComplete ?? null,
      refundWindow: wooCommerce?.refundWindow ?? null,
      observedRefundRange: wooCommerce?.observedRefundRange ?? null,
      observedPaidRange: wooCommerce?.observedPaidRange ?? null,
      refundRate: wooCommerce?.refundRate ?? null,
      discountRate: wooCommerce?.discountRate ?? null
    },
    ga4Window: ga4Window ?? null,
    wooWindow: wooWindow ?? null,
    windowStart,
    windowEnd,
    generatedAt
  };
  return safePayload;
}

function computeFunnelRates(ga4) {
  if (!ga4) return null;
  const computeRate = (numerator, denominator) => {
    if (numerator == null || denominator == null) return null;
    const num = Number(numerator);
    const denom = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return null;
    return roundRatio(num / denom);
  };

  return {
    viewToCart: computeRate(ga4.addToCartEvents, ga4.viewItemEvents),
    cartToCheckout: computeRate(ga4.beginCheckoutEvents, ga4.addToCartEvents),
    checkoutToPurchase: computeRate(ga4.purchaseEvents ?? ga4.ecommercePurchases, ga4.beginCheckoutEvents),
    sessionToPurchase: computeRate(ga4.ecommercePurchases, ga4.sessions)
  };
}

function toPacificDate(dateIso) {
  const date = dateIso ? new Date(dateIso) : new Date();
  const pacific = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = pacific.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function upsertGrowthHistory(payload) {
  if (!supabaseClient || !payload) return;
  const snapshotDate = toPacificDate(payload.generatedAt);
  const windowKey = '7d';
  const source = 'website';
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  try {
    const { error } = await supabaseClient
      .from('growth_snapshots')
      .upsert(
        {
          source,
          window_key: windowKey,
          snapshot_date: snapshotDate,
          generated_at: payload.generatedAt ?? new Date().toISOString(),
          window_start: payload.windowStart ?? null,
          window_end: payload.windowEnd ?? null,
          payload,
          payload_hash: payloadHash,
          schema_version: 1
        },
        {
          onConflict: 'source,window_key,snapshot_date'
        }
      );
    if (error) {
      console.error('[website-agent] growth_snapshots upsert failed:', error.message);
      await baseLog({ status: 'warning', message: `history upsert failed: ${error.message}` });
    } else {
      console.log('[website-agent] growth snapshot recorded (website, 7d, %s)', snapshotDate);
    }
  } catch (error) {
    console.error('[website-agent] growth snapshot upsert threw:', error instanceof Error ? error.message : error);
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

const [deviceBreakdown, channelBreakdown, eventCounts] = await Promise.all([
  fetchBreakdown('deviceCategory'),
  fetchBreakdown('sessionDefaultChannelGroup'),
  fetchGaEventCountsWithClient(client, warnings)
]);

return { baseReport, deviceBreakdown, channelBreakdown, eventCounts, warnings };
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

async function fetchGaEventCountsWithClient(client, warnings) {
  try {
    const [report] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [GA4_DATE_RANGE],
      metrics: [{ name: 'eventCount' }],
      dimensions: [{ name: 'eventName' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: REQUIRED_GA4_EVENTS }
        }
      }
    });
    return mapEventRowsToCounts(report.rows ?? []);
  } catch (error) {
    warnings.push(`eventName counts unavailable: ${error instanceof Error ? error.message : error}`);
    return buildEventCountRecord(null);
  }
}

async function fetchGaEventCountsWithApiKey(warnings) {
  try {
    const report = await runGa4ApiKeyReport({
      dateRanges: [GA4_DATE_RANGE],
      metrics: [{ name: 'eventCount' }],
      dimensions: [{ name: 'eventName' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: REQUIRED_GA4_EVENTS }
        }
      }
    });
    return mapEventRowsToCounts(report.rows ?? []);
  } catch (error) {
    warnings.push(`eventName counts unavailable: ${error instanceof Error ? error.message : error}`);
    return buildEventCountRecord(null);
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
    const eventCounts = await fetchGaEventCountsWithApiKey(warnings);
    return {
      ...normalized,
      ...eventCounts,
      warnings
    };
  }

  const { baseReport, deviceBreakdown, channelBreakdown, eventCounts, warnings } =
    await fetchGA4WithServiceAccount();
  const normalized = normalizeGa4Response(baseReport);
  return {
    ...normalized,
    ...eventCounts,
    deviceBreakdown,
    channelBreakdown,
    warnings
  };
}

async function fetchWooCommerceSummary(reportingWindow) {
  const auth = Buffer.from(`${wooKey}:${wooSecret}`).toString('base64');
  const { startInstant, endInstantExclusive, timezone, localStartDate, localEndDateExclusive, windowStartUtc, windowEndExclusiveUtc, label, rangeDays } = reportingWindow;
  const afterIso = windowStartUtc;
  const beforeIso = windowEndExclusiveUtc;
  const orderParams = new URLSearchParams({
    orderby: 'date',
    order: 'desc',
    per_page: String(WOO_PAGE_SIZE),
    modified_after: afterIso,
    modified_before: beforeIso
  });
  const refundParams = new URLSearchParams({
    orderby: 'date',
    order: 'desc',
    after: afterIso,
    before: beforeIso
  });

  const [rawOrders, refunds] = await Promise.all([
    fetchWooCollection('orders', orderParams, 'wooOrders', auth),
    fetchWooCollection('refunds', refundParams, 'wooRefunds', auth)
  ]);

  const dedupedOrders = [];
  const seenOrderIds = new Set();
  for (const order of rawOrders) {
    const id = order?.id ?? order?.number;
    const key = id != null ? String(id) : crypto.randomUUID();
    if (seenOrderIds.has(key)) continue;
    seenOrderIds.add(key);
    dedupedOrders.push(order);
  }

  const disqualifyingStatuses = new Set(['pending', 'cancelled', 'failed', 'trash']);
  const paidOrders = dedupedOrders.filter((order) => {
    if (disqualifyingStatuses.has(order?.status)) return false;
    const paidIso = order?.date_paid_gmt || order?.date_paid;
    if (!paidIso) return false;
    const paidDate = new Date(paidIso);
    if (!Number.isFinite(paidDate.getTime())) return false;
    return paidDate >= startInstant && paidDate < endInstantExclusive;
  });

  const paidOrdersInWindow = paidOrders.length;
  const grossOrderRevenueValue = sumNumeric(paidOrders, (order) => toNumber(order.total));
  const merchandiseRevenueValue = paidOrders.reduce((sum, order) => {
    return sum + sumNumeric(order.line_items ?? [], (item) => toNumber(item.total));
  }, 0);
  const shippingRevenueValue = sumNumeric(paidOrders, (order) => toNumber(order.shipping_total));
  const taxCollectedValue = sumNumeric(paidOrders, (order) => toNumber(order.total_tax));
  const discountTotalValue = sumNumeric(paidOrders, (order) => toNumber(order.discount_total));
  const refundTotalValue = sumNumeric(refunds, (refund) => toNumber(refund.amount ?? refund.total ?? refund.total_refunded));

  const grossOrderRevenue = roundCurrency(grossOrderRevenueValue);
  const merchandiseRevenue = roundCurrency(merchandiseRevenueValue);
  const shippingRevenue = roundCurrency(shippingRevenueValue);
  const taxCollected = roundCurrency(taxCollectedValue);
  const discountTotal = roundCurrency(discountTotalValue);
  const refundTotal = roundCurrency(refundTotalValue);
  const netRevenue = roundCurrency(grossOrderRevenueValue - refundTotalValue);
  const grossAov = paidOrdersInWindow ? roundCurrency(grossOrderRevenueValue / paidOrdersInWindow) : null;
  const netAov = paidOrdersInWindow ? roundCurrency((grossOrderRevenueValue - refundTotalValue) / paidOrdersInWindow) : null;
  const refundCount = refunds.length;

  const discountRate = grossOrderRevenueValue > 0 ? roundRatio(discountTotalValue / grossOrderRevenueValue) : null;
  const refundRate = grossOrderRevenueValue > 0 ? roundRatio(refundTotalValue / grossOrderRevenueValue) : null;

  const productMap = new Map();
  for (const order of paidOrders) {
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

  const recentOrders = paidOrders
    .map((order) => ({
      id: order.id,
      status: order.status,
      total: Number(order.total),
      currency: order.currency,
      date_paid: order.date_paid,
      date_paid_gmt: order.date_paid_gmt
    }))
    .slice(0, 10);

  const orderPaidTimes = paidOrders
    .map((order) => {
      const paidIso = order?.date_paid_gmt || order?.date_paid;
      return paidIso ? new Date(paidIso).getTime() : null;
    })
    .filter((value) => Number.isFinite(value));
  const observedPaidRange = orderPaidTimes.length
    ? {
        earliestPaid: new Date(Math.min(...orderPaidTimes)).toISOString(),
        latestPaid: new Date(Math.max(...orderPaidTimes)).toISOString()
      }
    : null;

  const refundDates = refunds
    .map((refund) => (refund.date_created ? new Date(refund.date_created).getTime() : null))
    .filter((value) => Number.isFinite(value));
  const observedRefundRange = refundDates.length
    ? {
        firstRefund: new Date(Math.min(...refundDates)).toISOString(),
        lastRefund: new Date(Math.max(...refundDates)).toISOString()
      }
    : null;

  return {
    paidOrdersInWindow,
    grossOrderRevenue,
    merchandiseRevenue,
    shippingRevenue,
    taxCollected,
    discountTotal,
    netRevenue,
    grossAov,
    netAov,
    refundTotal,
    refundCount,
    refundDefinition: 'Refunds issued during the reporting window (Pacific time).',
    refundDataComplete: false,
    refundWindow: {
      windowStart: afterIso,
      windowEndExclusive: beforeIso,
      timezone
    },
    observedRefundRange,
    observedPaidRange,
    refundRate,
    discountRate,
    topProducts,
    recentOrders,
    timezone,
    windowStartUtc,
    windowEndExclusiveUtc,
    localStartDate,
    localEndDateExclusive,
    label,
    rangeDays
  };
}

async function main() {
  try {
    const reportingWindow = computeReportingWindow();
    const [ga4Summary, wooSummary] = await Promise.all([
      fetchGA4Summary(),
      fetchWooCommerceSummary(reportingWindow)
    ]);

    const generatedAt = new Date();
    const generatedAtIso = generatedAt.toISOString();
    const windowStartIso = reportingWindow.startInstant.toISOString();
    const windowEndIso = reportingWindow.endInstantExclusive.toISOString();

    const ga4Window = {
      label: reportingWindow.label,
      startDate: reportingWindow.startDateText,
      endDate: reportingWindow.endDateText,
      timezone: reportingWindow.timezone,
      rangeDays: reportingWindow.rangeDays
    };

    const wooWindow = {
      label: reportingWindow.label,
      localStartDate: reportingWindow.localStartDate,
      localEndDateExclusive: reportingWindow.localEndDateExclusive,
      windowStartUtc: reportingWindow.windowStartUtc,
      windowEndExclusiveUtc: reportingWindow.windowEndExclusiveUtc,
      timezone: reportingWindow.timezone,
      rangeDays: reportingWindow.rangeDays
    };

    const output = {
      generatedAt: generatedAtIso,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      ga4: ga4Summary,
      ga4Window,
      wooCommerce: wooSummary,
      wooWindow
    };

    await fs.mkdir(path.dirname(agentOutputPath), { recursive: true });
    await fs.writeFile(agentOutputPath, JSON.stringify(output, null, 2));

    await baseLog({ status: 'success', orders: wooSummary.paidOrdersInWindow, sessions: ga4Summary.sessions });
    await sendSchedulerAlert({
      status: 'success',
      message: 'Website agent completed',
      orders: wooSummary.paidOrdersInWindow,
      sessions: ga4Summary.sessions
    });
    const conversionRate =
      ga4Summary?.sessions && ga4Summary.sessions > 0 && ga4Summary?.ecommercePurchases != null
        ? ((ga4Summary.ecommercePurchases / ga4Summary.sessions) * 100).toFixed(2)
        : 'n/a';
    const websiteStatus = ga4Summary && wooSummary ? 'LIVE' : ga4Summary || wooSummary ? 'PARTIAL' : 'BROKEN';
    output.status = websiteStatus;
    await upsertSupabaseSnapshot(output, websiteStatus);
    const historyPayload = buildHistoryPayload(output);
    await upsertGrowthHistory(historyPayload);

    console.log(
      `[website-agent] Summary: generatedAt=${output.generatedAt} ga4.users=${ga4Summary?.totalUsers ?? 'n/a'} ga4.sessions=${
        ga4Summary?.sessions ?? 'n/a'
      } ga4.purchases=${ga4Summary?.ecommercePurchases ?? 'n/a'} ga4.add_to_cart=${
        ga4Summary?.addToCartEvents ?? 'n/a'
      } ga4.begin_checkout=${ga4Summary?.beginCheckoutEvents ?? 'n/a'} ga4.conversion_rate=${conversionRate}% woo.paid_orders=${
        wooSummary.paidOrdersInWindow ?? 'n/a'
      } woo.gross=${wooSummary.grossOrderRevenue ?? 'n/a'} woo.net=${wooSummary.netRevenue ?? 'n/a'} woo.gross_aov=${
        wooSummary.grossAov ?? 'n/a'
      } status=${websiteStatus}`
    );
    console.log('[website-agent] Updated website metrics snapshot');
  } catch (error) {
    const friendlyMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error && typeof error === 'object' && 'details' in error ? error.details : undefined;
    const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const diagnostic = { message: friendlyMessage, details: errorDetails, code: errorCode };

    await baseLog({
      status: 'error',
      ...diagnostic,
      stack: error instanceof Error && error.stack ? error.stack : undefined
    });
    await sendSchedulerAlert({ status: 'error', message: friendlyMessage });

    console.error('[website-agent] Failed:', friendlyMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await main();

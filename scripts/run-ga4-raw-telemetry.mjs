#!/usr/bin/env node
import process from 'node:process';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { createClient } from '@supabase/supabase-js';

const required = ['GA4_CREDENTIALS_JSON', 'GA4_PROPERTY_ID', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`[ga4-ingest] Missing env var: ${key}`);
}

const credentials = JSON.parse(process.env.GA4_CREDENTIALS_JSON.trim());
const propertyId = process.env.GA4_PROPERTY_ID.trim();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const analytics = new BetaAnalyticsDataClient({ credentials });

const startDate = process.env.GA4_INGEST_START_DATE?.trim() || '90daysAgo';
const endDate = process.env.GA4_INGEST_END_DATE?.trim() || 'yesterday';
const runStarted = new Date().toISOString();

function parseGaDate(value) {
  if (!/^\d{8}$/.test(value || '')) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(row) {
  const d = row.dimensionValues ?? [];
  const m = row.metricValues ?? [];
  const eventDate = parseGaDate(d[0]?.value ?? '');
  const pagePath = d[1]?.value || '(not set)';
  const pageTitle = d[2]?.value || null;
  const deviceCategory = d[3]?.value || '(not set)';
  const trafficSource = d[4]?.value || '(not set)';
  const eventName = d[5]?.value || '(not set)';
  return {
    event_date: eventDate,
    page_path: pagePath,
    page_title: pageTitle,
    device_category: deviceCategory,
    traffic_source: trafficSource,
    event_name: eventName,
    event_count: Math.trunc(num(m[0]?.value)),
    sessions: Math.trunc(num(m[1]?.value)),
    engaged_sessions: Math.trunc(num(m[2]?.value)),
    user_engagement_duration_ms: num(m[3]?.value) * 1000,
    revenue: num(m[4]?.value),
    metadata: {
      ingestion: 'ga4_data_api_v2',
      sourceRange: { startDate, endDate },
      ingestedAt: new Date().toISOString()
    }
  };
}

async function fetchRows() {
  const [report] = await analytics.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'date' },
      { name: 'pagePath' },
      { name: 'pageTitle' },
      { name: 'deviceCategory' },
      { name: 'sessionSourceMedium' },
      { name: 'eventName' }
    ],
    metrics: [
      { name: 'eventCount' },
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'userEngagementDuration' },
      { name: 'purchaseRevenue' }
    ],
    limit: 100000
  });
  return (report.rows ?? []).map(mapRow).filter((row) => row.event_date);
}

async function upsertRows(rows) {
  const db = supabase.schema('exec_dashboard');
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await db.from('raw_ga4_events').upsert(batch, {
      onConflict: 'event_date,page_path,device_category,traffic_source,event_name'
    });
    if (error) throw new Error(`[ga4-ingest] Supabase upsert failed: ${error.message}`);
  }
}

async function recordRun(status, rowCount, errorText = null) {
  const { error } = await supabase.schema('exec_dashboard').from('ingest_runs').insert({
    source: 'ga4_data_api_v2',
    run_started: runStarted,
    run_finished: new Date().toISOString(),
    status,
    woo_orders: 0,
    ga4_rows: rowCount,
    funnelkit_steps: 0,
    error: errorText
  });
  if (error) console.warn('[ga4-ingest] Could not record ingest run:', error.message);
}

try {
  const rows = await fetchRows();
  await upsertRows(rows);
  await recordRun('success', rows.length);
  console.log(`[ga4-ingest] success rows=${rows.length} range=${startDate}..${endDate}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await recordRun('error', 0, message);
  console.error('[ga4-ingest] failed:', message);
  process.exit(1);
}

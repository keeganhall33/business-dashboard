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
  return {
    event_date: eventDate,
    page_path: d[1]?.value || '(not set)',
    page_title: d[2]?.value || null,
    device_category: d[3]?.value || '(not set)',
    traffic_source: d[4]?.value || '(not set)',
    event_name: d[5]?.value || '(not set)',
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

async function ingestRows(rows) {
  const batchSize = 1000;
  let ingested = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { data, error } = await supabase.rpc('ingest_ga4_raw_events_v2', {
      p_rows: batch,
      p_run_started: runStarted,
      p_start_date: startDate,
      p_end_date: endDate
    });
    if (error) throw new Error(`[ga4-ingest] Supabase RPC failed: ${error.message}`);
    ingested += Number(data ?? batch.length);
  }
  return ingested;
}

try {
  const rows = await fetchRows();
  const ingested = await ingestRows(rows);
  console.log(`[ga4-ingest] success fetched=${rows.length} ingested=${ingested} range=${startDate}..${endDate}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[ga4-ingest] failed:', message);
  process.exit(1);
}

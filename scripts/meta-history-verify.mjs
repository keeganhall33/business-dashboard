#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function arg(flag) {
  const entry = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return entry ? entry.split('=')[1] : '';
}

const mode = arg('mode');
const runId = arg('run-id');
const since = arg('since');
const until = arg('until');
const validationPath = arg('validation');
const outPath = arg('out') || '/tmp/meta-history-run-report.json';

if (!runId || !validationPath || !since || !until) {
  console.error('[meta-history-verify] missing args');
  process.exit(1);
}

const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));

const allowedWarnings = [
  /^Creative \d+: Creative missing destination URL$/,
  /^Creative \d+: Creative missing primary text\/headline$/
];
const previewOnlyWarning = /^dry-run: Supabase writes skipped$/;

const pacificFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getPacificYmd(date) {
  const parts = pacificFormatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      values[part.type] = Number(part.value);
    }
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day
  };
}

function shiftDate({ year, month, day }, deltaDays) {
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate()
  };
}

function formatYmd({ year, month, day }) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function latestPacificRange() {
  const today = getPacificYmd(new Date());
  const end = shiftDate(today, -1);
  const start = shiftDate(end, -2);
  return { since: formatYmd(start), until: formatYmd(end) };
}

const expected = latestPacificRange();
if (since !== expected.since || until !== expected.until) {
  console.error('[meta-history-verify] date range mismatch', since, until, expected);
  process.exit(2);
}

if (validation.runId !== runId) {
  console.error('[meta-history-verify] runId mismatch between wrapper and artifact');
  process.exit(3);
}

if (mode === 'preview') {
  if (validation.status !== 'LIVE') {
    console.error('[meta-history-verify] preview: status not LIVE');
    process.exit(4);
  }
  const nonBenign = (validation.warnings || []).filter((w) => {
    if (previewOnlyWarning.test(w)) return false;
    return !allowedWarnings.some((regex) => regex.test(w));
  });
  if (nonBenign.length) {
    console.error('[meta-history-verify] preview: unexpected warnings', nonBenign);
    process.exit(5);
  }
  console.log('[meta-history-verify] preview PASS');
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('[meta-history-verify] prod: missing Supabase env');
  process.exit(10);
}
const client = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: runRow, error: runErr } = await client
  .from('meta_ingestion_runs')
  .select('run_id,status,date_start,date_end,row_counts,warnings')
  .eq('run_id', runId)
  .single();

if (runErr || !runRow) {
  console.error('[meta-history-verify] prod: run_id not found', runErr);
  process.exit(11);
}

if (runRow.status !== 'LIVE') {
  console.error('[meta-history-verify] prod: status not LIVE');
  process.exit(12);
}
if (runRow.date_start !== since || runRow.date_end !== until) {
  console.error('[meta-history-verify] prod: date range mismatch', runRow.date_start, runRow.date_end);
  process.exit(13);
}
const nonBenign = (runRow.warnings || []).filter((w) => !allowedWarnings.some((regex) => regex.test(w)));
if (nonBenign.length) {
  console.error('[meta-history-verify] prod: unexpected warnings', nonBenign);
  process.exit(14);
}

const dailyTables = [
  { table: 'meta_account_daily', key: 'account_daily' },
  { table: 'meta_campaign_daily', key: 'campaign_daily' },
  { table: 'meta_adset_daily', key: 'adset_daily' },
  { table: 'meta_ad_daily', key: 'ad_daily' }
];

for (const { table, key } of dailyTables) {
  const expectedCount = Number(runRow.row_counts?.[key] ?? 0);
  const { data, error } = await client
    .from(table)
    .select('metric_date', { head: false })
    .eq('source_run_id', runId);
  if (error) {
    console.error('[meta-history-verify] prod: daily count failed', table, error);
    process.exit(15);
  }
  const rows = data ?? [];
  if (rows.length !== expectedCount) {
    console.error('[meta-history-verify] prod: daily count mismatch', table, rows.length, expectedCount);
    process.exit(16);
  }
  if (rows.length > 0) {
    const dates = rows.map((row) => row.metric_date).filter(Boolean);
    const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
    const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
    if (minDate < since || maxDate > until) {
      console.error('[meta-history-verify] prod: metric_date bounds violated', table, minDate, maxDate);
      process.exit(17);
    }
  }
}

const linkedTables = [
  { table: 'meta_creative_versions', key: 'creative_versions' },
  { table: 'meta_ad_creative_map', key: 'ad_creative_map' }
];

for (const { table, key } of linkedTables) {
  const expectedCount = Number(runRow.row_counts?.[key] ?? 0);
  const { count, error } = await client
    .from(table)
    .select('source_run_id', { head: true, count: 'exact' })
    .eq('source_run_id', runId);
  if (error) {
    console.error('[meta-history-verify] prod: linked count failed', table, error);
    process.exit(18);
  }
  if ((count ?? 0) !== expectedCount) {
    console.error('[meta-history-verify] prod: linked count mismatch', table, count, expectedCount);
    process.exit(19);
  }
}

const { data: versionRows, error: versionErr } = await client
  .from('meta_creative_versions')
  .select('creative_id')
  .eq('source_run_id', runId);
if (versionErr) {
  console.error('[meta-history-verify] prod: creative version fetch failed', versionErr);
  process.exit(20);
}
const { data: mapRows, error: mapErr } = await client
  .from('meta_ad_creative_map')
  .select('creative_id')
  .eq('source_run_id', runId);
if (mapErr) {
  console.error('[meta-history-verify] prod: creative map fetch failed', mapErr);
  process.exit(21);
}
const neededCreatives = new Set(
  [...(versionRows ?? []), ...(mapRows ?? [])]
    .map((row) => row.creative_id)
    .filter(Boolean)
);
if (neededCreatives.size > 0) {
  const { data: foundCreatives, error: creativeErr } = await client
    .from('meta_creatives')
    .select('creative_id')
    .in('creative_id', Array.from(neededCreatives));
  if (creativeErr) {
    console.error('[meta-history-verify] prod: creatives lookup failed', creativeErr);
    process.exit(22);
  }
  const foundSet = new Set((foundCreatives ?? []).map((row) => row.creative_id));
  for (const id of neededCreatives) {
    if (!foundSet.has(id)) {
      console.error('[meta-history-verify] prod: missing creative', id);
      process.exit(23);
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(runRow, null, 2));
console.log('[meta-history-verify] prod PASS');
process.exit(0);

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SOURCE = 'funnelkit_data_api_v2';
const FUNNEL_ID = 1;
const MAX_BACKFILL_DAYS = 120;

function envOrThrow(key) {
  const v = process.env[key];
  if (!v || !String(v).trim()) throw new Error(`Missing ${key}`);
  return String(v).trim();
}

function parseArgs(argv) {
  const out = { start: null, end: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--start' && argv[i + 1]) out.start = argv[++i];
    else if (argv[i] === '--end' && argv[i + 1]) out.end = argv[++i];
  }
  return out;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function yesterdayPacific() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return addDays(`${map.year}-${map.month}-${map.day}`, -1);
}

function pacificMidnightIso(dateStr) {
  // Determine the UTC offset at noon on this date, then express local midnight with that offset.
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset', hour: '2-digit'
  }).formatToParts(noonUtc);
  const offsetPart = tzParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-07:00';
  const offset = offsetPart.replace('GMT', '');
  return `${dateStr}T00:00:00${offset}`;
}

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = envOrThrow('FUNNELKIT_BASE_URL').replace(/\/$/, '');
  const username = envOrThrow('FUNNELKIT_USERNAME');
  const password = envOrThrow('FUNNELKIT_PASSWORD');
  const supabaseUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const exec = db.schema('exec_dashboard');
  const runId = crypto.randomUUID();
  const started = new Date().toISOString();

  await exec.from('ingest_runs').insert({
    id: runId,
    source: SOURCE,
    run_started: started,
    status: 'running',
    woo_orders: 0,
    ga4_rows: 0,
    funnelkit_steps: 0,
    error: null
  });

  let totalSteps = 0;
  let processedDays = 0;
  let startDate = args.start;
  const endDate = args.end || yesterdayPacific();

  try {
    if (!startDate) {
      const { data, error } = await exec
        .from('raw_funnelkit_steps')
        .select('collected_at')
        .order('collected_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const latest = data?.[0]?.collected_at || null;
      startDate = latest ? addDays(latest, 1) : endDate;
      if (startDate > endDate) startDate = endDate;
    }

    const span = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000) + 1;
    if (span < 1) throw new Error(`Invalid FunnelKit range ${startDate}..${endDate}`);
    if (span > MAX_BACKFILL_DAYS) throw new Error(`FunnelKit backfill span ${span} exceeds safety cap ${MAX_BACKFILL_DAYS}`);

    const headers = {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      Accept: 'application/json',
      'User-Agent': 'business-dashboard-funnelkit-ingestion/2.0'
    };

    for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
      const next = addDays(day, 1);
      const url = new URL(`/wp-json/funnelkit-app/funnel-analytics/${FUNNEL_ID}/steps`, baseUrl + '/');
      url.searchParams.set('after', pacificMidnightIso(day));
      url.searchParams.set('before', pacificMidnightIso(next));

      const res = await fetch(url, { headers, redirect: 'manual' });
      const text = await res.text();
      if (!res.ok) {
        let code = '';
        try { code = JSON.parse(text)?.code || ''; } catch {}
        throw new Error(`FunnelKit ${day} failed status=${res.status} code=${String(code).slice(0,80)}`);
      }

      const payload = JSON.parse(text);
      if (payload?.status !== true || !payload?.data || !Array.isArray(payload.data.records)) {
        throw new Error(`FunnelKit ${day} returned unexpected payload shape`);
      }

      const funnelData = payload.data.funnel_data || {};
      const records = payload.data.records;
      const rows = records.map((r, index) => ({
        funnel_id: Number(funnelData.id || FUNNEL_ID),
        funnel_name: String(funnelData.title || 'Minimal store checkout funnel'),
        step_id: Number(r.object_id),
        step_name: String(r.object_name || r.type || `Step ${index + 1}`),
        step_index: index + 1,
        collected_at: day,
        entries: int(r.views),
        completions: int(r.conversions),
        avg_time_seconds: null,
        upsell_offers: 0,
        upsell_accepts: 0
      })).filter(r => Number.isFinite(r.step_id));

      if (rows.length) {
        const { error } = await exec
          .from('raw_funnelkit_steps')
          .upsert(rows, { onConflict: 'step_id,collected_at' });
        if (error) throw error;
      }

      const { error: coverageError } = await exec
        .from('source_daily_coverage_v1')
        .upsert({
          source: 'funnelkit',
          coverage_date: day,
          coverage_status: 'complete',
          row_count: rows.length,
          observed_at: new Date().toISOString(),
          run_ref: runId,
          details: {
            endpoint: 'funnelkit-app/funnel-analytics/{id}/steps',
            funnel_id: FUNNEL_ID,
            activity_entries: rows.reduce((s, r) => s + r.entries, 0),
            activity_completions: rows.reduce((s, r) => s + r.completions, 0)
          }
        }, { onConflict: 'source,coverage_date' });
      if (coverageError) throw coverageError;

      totalSteps += rows.length;
      processedDays += 1;
      console.log(JSON.stringify({ source: SOURCE, day, rows: rows.length, entries: rows.reduce((s,r)=>s+r.entries,0), completions: rows.reduce((s,r)=>s+r.completions,0) }));
    }

    await exec.from('ingest_runs').update({
      run_finished: new Date().toISOString(),
      status: 'success',
      funnelkit_steps: totalSteps,
      error: null
    }).eq('id', runId);

    console.log(JSON.stringify({ status: 'success', source: SOURCE, runId, startDate, endDate, processedDays, totalSteps }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await exec.from('ingest_runs').update({
      run_finished: new Date().toISOString(),
      status: 'error',
      funnelkit_steps: totalSteps,
      error: message.slice(0, 500)
    }).eq('id', runId);
    console.error(JSON.stringify({ status: 'error', source: SOURCE, runId, startDate, endDate, processedDays, totalSteps, error: message }));
    process.exit(1);
  }
}

await main();

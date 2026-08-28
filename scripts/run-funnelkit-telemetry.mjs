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

function isoDate(d) { return d.toISOString().slice(0, 10); }

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
  const noonUtc = new Date(`${dateStr}T12:00:00Z`);
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', timeZoneName: 'longOffset', hour: '2-digit'
  }).formatToParts(noonUtc);
  const offsetPart = tzParts.find(p => p.type === 'timeZoneName')?.value || 'GMT-07:00';
  return `${dateStr}T00:00:00${offsetPart.replace('GMT', '')}`;
}

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function errorMessage(err) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const bits = [err.message, err.details, err.hint, err.code].filter(Boolean).map(String);
    if (bits.length) return bits.join(' | ');
    try { return JSON.stringify(err); } catch {}
  }
  return String(err);
}

async function rpcOrThrow(db, fn, params = {}) {
  const { data, error } = await db.rpc(fn, params);
  if (error) throw error;
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = envOrThrow('FUNNELKIT_BASE_URL').replace(/\/$/, '');
  const username = envOrThrow('FUNNELKIT_USERNAME');
  const password = envOrThrow('FUNNELKIT_PASSWORD');
  const supabaseUrl = envOrThrow('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const runId = crypto.randomUUID();
  const started = new Date().toISOString();
  let totalSteps = 0;
  let processedDays = 0;
  let startDate = args.start;
  const endDate = args.end || yesterdayPacific();

  try {
    await rpcOrThrow(db, 'log_funnelkit_ingest_run_v2', {
      p_id: runId,
      p_run_started: started,
      p_run_finished: null,
      p_status: 'running',
      p_steps: 0,
      p_error: null
    });

    if (!startDate) {
      const latest = await rpcOrThrow(db, 'get_funnelkit_latest_date_v2');
      startDate = latest ? addDays(String(latest), 1) : endDate;
      if (startDate > endDate) startDate = endDate;
    }

    const span = Math.round((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000) + 1;
    if (span < 1) throw new Error(`Invalid FunnelKit range ${startDate}..${endDate}`);
    if (span > MAX_BACKFILL_DAYS) throw new Error(`FunnelKit backfill span ${span} exceeds safety cap ${MAX_BACKFILL_DAYS}`);

    const headers = {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      Accept: 'application/json',
      'User-Agent': 'business-dashboard-funnelkit-ingestion/2.1'
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
        entries: int(r.views),
        completions: int(r.conversions),
        avg_time_seconds: null,
        upsell_offers: 0,
        upsell_accepts: 0
      })).filter(r => Number.isFinite(r.step_id));

      const activityEntries = rows.reduce((s, r) => s + r.entries, 0);
      const activityCompletions = rows.reduce((s, r) => s + r.completions, 0);

      const written = await rpcOrThrow(db, 'ingest_funnelkit_day_v2', {
        p_rows: rows,
        p_coverage_date: day,
        p_run_ref: runId,
        p_details: {
          endpoint: 'funnelkit-app/funnel-analytics/{id}/steps',
          funnel_id: FUNNEL_ID,
          activity_entries: activityEntries,
          activity_completions: activityCompletions
        }
      });

      totalSteps += Number(written || 0);
      processedDays += 1;
      console.log(JSON.stringify({ source: SOURCE, day, rows: Number(written || 0), entries: activityEntries, completions: activityCompletions }));
    }

    await rpcOrThrow(db, 'log_funnelkit_ingest_run_v2', {
      p_id: runId,
      p_run_started: started,
      p_run_finished: new Date().toISOString(),
      p_status: 'success',
      p_steps: totalSteps,
      p_error: null
    });

    console.log(JSON.stringify({ status: 'success', source: SOURCE, runId, startDate, endDate, processedDays, totalSteps }));
  } catch (err) {
    const message = errorMessage(err);
    try {
      await rpcOrThrow(db, 'log_funnelkit_ingest_run_v2', {
        p_id: runId,
        p_run_started: started,
        p_run_finished: new Date().toISOString(),
        p_status: 'error',
        p_steps: totalSteps,
        p_error: message.slice(0, 500)
      });
    } catch (logErr) {
      console.error(JSON.stringify({ status: 'run_log_error', error: errorMessage(logErr) }));
    }
    console.error(JSON.stringify({ status: 'error', source: SOURCE, runId, startDate, endDate, processedDays, totalSteps, error: message }));
    process.exit(1);
  }
}

await main();

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'cloudflare_telemetry.log');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'manual_input.json');
const SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'snapshot.json');

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CF_ZONE = process.env.CLOUDFLARE_ZONE_ID?.trim();
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const schedulerSecretPresent = Boolean(process.env.SCHEDULER_SECRET?.trim());
const schedulerAlertUrlPresent = Boolean(process.env.SCHEDULER_ALERT_URL?.trim());
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseClient = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
if (!supabaseClient) {
  console.warn(
    `[cloudflare] Supabase env missing; urlPresent=${Boolean(supabaseUrl)} keyPresent=${Boolean(supabaseServiceRoleKey)} - skipping remote snapshot upsert`
  );
}
const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GRAPHQL_LOOKBACK_HOURS = Number(process.env.CLOUDFLARE_LOOKBACK_HOURS ?? 12);
const GRAPHQL_QUERY = `
  query GetZoneAnalytics($zoneTag: ID!, $from: Time!, $to: Time!) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        totals: httpRequestsAdaptiveGroups(limit: 1, filter: { datetime_geq: $from, datetime_lt: $to }) {
          count
          sum {
            edgeResponseBytes
          }
        }
        countryGroups: httpRequestsAdaptiveGroups(
          limit: 5,
          filter: { datetime_geq: $from, datetime_lt: $to },
          orderBy: [count_DESC]
        ) {
          dimensions {
            clientCountryName
          }
          count
        }
        pathGroups: httpRequestsAdaptiveGroups(
          limit: 5,
          filter: { datetime_geq: $from, datetime_lt: $to },
          orderBy: [count_DESC]
        ) {
          dimensions {
            clientRequestHTTPHost
            clientRequestPath
          }
          count
        }
      }
    }
  }
`;

async function safeReadJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function appendLog(entry) {
  const payload = { timestamp: new Date().toISOString(), ...entry };
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(payload) + '\n');
}

function mergeTelemetry(base, fallback) {
  if (!base && !fallback) return null;
  return {
    generatedAt: new Date().toISOString(),
    zone: base?.zone ?? fallback?.zone ?? null,
    traffic: base?.traffic ?? fallback?.traffic ?? null,
    security: base?.security ?? fallback?.security ?? null,
    performance: base?.performance ?? fallback?.performance ?? null,
    top: base?.top ?? fallback?.top ?? null,
    warnings: base?.warnings ?? fallback?.warnings ?? [],
    status: base?.status ?? fallback?.status ?? {}
  };
}

function summarize(snapshot) {
  if (!snapshot) {
    return {
      status: {
        mode: 'unavailable',
        reason: 'No telemetry data present'
      },
      summary: {
        cacheHealth: 'unknown',
        trafficHealth: 'unknown'
      }
    };
  }
  const cacheHitRate = snapshot?.traffic?.cacheHitRate ?? null;
  return {
    ...snapshot,
    summary: {
      cacheHitRate,
      cacheHealth: typeof cacheHitRate === 'number' ? (cacheHitRate >= 0.7 ? 'healthy' : 'needs attention') : 'unknown',
      trafficHealth: snapshot?.traffic?.requestsTotal ? 'active' : 'unknown',
      securityPressure: snapshot?.security?.threats ?? 0,
      warnings: snapshot?.warnings ?? []
    }
  };
}

async function fetchCloudflareTelemetry() {
  await appendLog({
    status: 'diagnostic',
    env: {
      tokenPresent: Boolean(CF_TOKEN),
      tokenLength: CF_TOKEN?.length ?? 0,
      accountIdPresent: Boolean(CF_ACCOUNT),
      accountIdLength: CF_ACCOUNT?.length ?? 0,
      zoneIdPresent: Boolean(CF_ZONE),
      zoneIdLength: CF_ZONE?.length ?? 0,
      schedulerSecretPresent,
      schedulerAlertUrlPresent,
      supabaseUrlPresent: Boolean(supabaseUrl),
      supabaseKeyPresent: Boolean(supabaseServiceRoleKey)
    }
  });

  if (!CF_TOKEN || !CF_ZONE) {
    await appendLog({ status: 'info', message: 'Cloudflare env vars missing. Snapshot/manual mode only.' });
    return { data: null, status: { mode: 'SNAPSHOT', reason: 'missing_env' } };
  }

  const now = new Date();
  const from = new Date(now.getTime() - GRAPHQL_LOOKBACK_HOURS * 60 * 60 * 1000);
  const variables = {
    zoneTag: CF_ZONE,
    from: from.toISOString(),
    to: now.toISOString()
  };

  try {
    await appendLog({ status: 'info', message: 'Cloudflare GraphQL live read attempted', meta: { endpoint: GRAPHQL_ENDPOINT, lookbackHours: GRAPHQL_LOOKBACK_HOURS } });
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: GRAPHQL_QUERY, variables })
    });

    const rawText = await response.text();
    let json;
    try {
      json = JSON.parse(rawText);
    } catch {
      throw new Error(`Cloudflare GraphQL parse failure: ${rawText}`);
    }

    if (!response.ok || json?.errors?.length) {
      const gqlErrors = json?.errors?.map((err) => `${err.code ?? err.extensions?.code ?? 'ERR'} ${err.message}`).join('; ');
      throw new Error(`Cloudflare GraphQL call failed: ${response.status} ${gqlErrors || rawText}`);
    }

    const zoneData = json?.data?.viewer?.zones?.[0];
    if (!zoneData) {
      throw new Error('Cloudflare GraphQL returned no zone data');
    }

    const totalsNode = zoneData.totals?.[0] ?? {};
    const totalsSum = totalsNode.sum ?? {};
    const countries = (zoneData.countryGroups ?? [])
      .map((group) => ({ name: group.dimensions?.clientCountryName ?? 'Unknown', requests: group.count ?? 0 }))
      .filter((entry) => entry.requests)
      .slice(0, 5);
    const paths = (zoneData.pathGroups ?? [])
      .map((group) => ({
        host: group.dimensions?.clientRequestHTTPHost ?? '',
        path: group.dimensions?.clientRequestPath ?? '/',
        requests: group.count ?? 0
      }))
      .filter((entry) => entry.requests)
      .map((entry) => ({ path: entry.host ? `${entry.host}${entry.path}` : entry.path, requests: entry.requests }))
      .slice(0, 5);

    const traffic = {
      requestsTotal: totalsNode.count ?? null,
      bandwidthBytes: totalsSum.edgeResponseBytes ?? null
    };
    traffic.cacheHitRate = null;
    traffic.cachedPercent = null;

    const warnings = [];
    if (!traffic.requestsTotal) warnings.push('No request totals returned from GraphQL');
    if (!countries.length) warnings.push('Top countries unavailable');
    if (!paths.length) warnings.push('Top paths unavailable');

    return {
      data: {
        generatedAt: now.toISOString(),
        zone: {
          name: CF_ZONE,
          status: null,
          plan: null
        },
        traffic,
        security: {
          threats: null
        },
        performance: {
          cacheHitWarning: typeof traffic.cacheHitRate === 'number' ? traffic.cacheHitRate < 0.7 : null
        },
        top: {
          countries,
          paths
        },
        warnings
      },
      status: {
        mode: warnings.length && !traffic.requestsTotal ? 'PARTIAL' : 'LIVE',
        source: 'cloudflare_graphql',
        accountIdSuffix: CF_ACCOUNT ? CF_ACCOUNT.slice(-4) : null,
        zoneIdLength: CF_ZONE.length,
        lookbackHours: GRAPHQL_LOOKBACK_HOURS
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendLog({ status: 'warning', message, meta: { endpoint: GRAPHQL_ENDPOINT } });
    return { data: null, status: { mode: 'BROKEN', reason: message, source: 'cloudflare_graphql' } };
  }
}

async function main() {
  const [manualInput, snapshot, live] = await Promise.all([
    safeReadJson(MANUAL_INPUT),
    safeReadJson(SNAPSHOT_PATH),
    fetchCloudflareTelemetry()
  ]);

  const baseData = live.data ? { ...live.data, status: live.status } : null;
  const fallbackData = snapshot || manualInput ? { ...(snapshot ?? manualInput), status: { mode: 'SNAPSHOT', source: snapshot ? 'snapshot.json' : 'manual_input' } } : null;
  const merged = summarize(mergeTelemetry(baseData, fallbackData));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  await appendLog({ status: 'success', mode: merged?.status?.mode ?? 'unknown' });
  await upsertSupabaseSnapshot(merged);
  console.log('[cloudflare] Telemetry snapshot written');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[cloudflare] Failed:', message);
  process.exit(1);
});

async function upsertSupabaseSnapshot(snapshot) {
  if (!supabaseClient || !snapshot) return;
  try {
    const { error } = await supabaseClient
      .from('dashboard_snapshots')
      .upsert({
        key: 'cloudflare',
        payload: snapshot,
        mode: snapshot?.status?.mode ?? null,
        generated_at: typeof snapshot?.generatedAt === 'string' ? snapshot.generatedAt : null
      });
    if (error) {
      console.error('[cloudflare] Supabase snapshot upsert failed:', error.message);
      await appendLog({ status: 'warning', message: `supabase upsert failed: ${error.message}` });
    } else {
      console.log('[cloudflare] Supabase dashboard snapshot updated (cloudflare)');
    }
  } catch (error) {
    console.error('[cloudflare] Supabase snapshot upsert threw:', error instanceof Error ? error.message : error);
  }
}

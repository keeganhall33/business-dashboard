#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'cloudflare_telemetry.log');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'manual_input.json');
const SNAPSHOT_PATH = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'snapshot.json');

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const CF_ZONE = process.env.CLOUDFLARE_ZONE_ID?.trim();
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

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
  if (!CF_TOKEN || !CF_ZONE) {
    await appendLog({ status: 'info', message: 'No Cloudflare env vars detected. Snapshot/manual mode only.' });
    return { data: null, status: { mode: 'snapshot', reason: 'missing_env' } };
  }

  const params = new URLSearchParams({ since: '-43200', continuous: 'true' });
  const url = `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/analytics/dashboard?${params}`;
  try {
    await appendLog({ status: 'info', message: 'Cloudflare live read attempted. Writes disabled.' });
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloudflare analytics call failed: ${response.status} ${text}`);
    }
    const json = await response.json();
    const result = json?.result;
    if (!result) throw new Error('Cloudflare API returned no analytics result');

    const zoneInfo = {
      name: result.zone_name ?? null,
      status: result.zone_status ?? null,
      plan: result.plan ?? null
    };

    const traffic = {
      requestsTotal: result.totals?.requests ?? null,
      bandwidthBytes: result.totals?.bandwidth ?? null,
      cachedPercent: result.totals?.cachedRequests ? (result.totals.cachedRequests / (result.totals.requests || 1)) * 100 : null,
      uncachedRequests: result.totals?.uncachedRequests ?? null,
      cacheHitRate: result.totals?.cachedRequests && result.totals?.requests ? result.totals.cachedRequests / result.totals.requests : null,
      bandwidthCachedBytes: result.totals?.cachedBandwidth ?? null,
      bandwidthUncachedBytes: result.totals?.uncachedBandwidth ?? null
    };

    const security = {
      threats: result.totals?.threats ?? null,
      blockedRequests: result.totals?.pageViews ?? null,
      firewallEvents: result.totals?.pageViews ?? null,
      botRequests: result?.totals?.botRequests ?? null,
      botScore: null
    };

    const performance = {
      avgResponseTimeMs: result.totals?.responseTime ?? null,
      p95ResponseTimeMs: null,
      cacheHitWarning: traffic.cacheHitRate !== null && traffic.cacheHitRate < 0.7,
      latencyWarning: false,
      notes: null
    };

    return {
      data: {
        zone: zoneInfo,
        traffic,
        security,
        performance,
        top: {
          countries: (result.top?.countries ?? []).map((c) => ({ name: c.clientCountry, requests: c.requests })),
          paths: (result.top?.urls ?? []).map((p) => ({ path: p.url, requests: p.requests }))
        },
        warnings: []
      },
      status: {
        mode: 'cloudflare-live',
        accountId: CF_ACCOUNT ?? null,
        zoneId: CF_ZONE
      }
    };
  } catch (error) {
    await appendLog({ status: 'warning', message: String(error) });
    return { data: null, status: { mode: 'snapshot', reason: String(error) } };
  }
}

async function main() {
  const [manualInput, snapshot, live] = await Promise.all([
    safeReadJson(MANUAL_INPUT),
    safeReadJson(SNAPSHOT_PATH),
    fetchCloudflareTelemetry()
  ]);

  const baseData = live.data ? { ...live.data, status: live.status } : null;
  const fallbackData = snapshot || manualInput ? { ...(snapshot ?? manualInput), status: { mode: 'snapshot', source: snapshot ? 'snapshot.json' : 'manual_input' } } : null;
  const merged = summarize(mergeTelemetry(baseData, fallbackData));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  await appendLog({ status: 'success', mode: merged?.status?.mode ?? 'unknown' });
  console.log('[cloudflare] Telemetry snapshot written');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[cloudflare] Failed:', message);
  process.exit(1);
});

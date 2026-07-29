#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const repoRoot = process.cwd();
const DASHBOARD_ROOT = path.join(repoRoot, 'dashboard');
const WEBSITE_JSON = path.join(DASHBOARD_ROOT, 'data', 'website', 'latest.json');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'social', 'manual_input.json');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'social', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'social_intelligence.log');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseClient = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
if (!supabaseClient) {
  console.warn(
    `[social] Supabase env missing; urlPresent=${Boolean(supabaseUrl)} keyPresent=${Boolean(supabaseServiceRoleKey)} - skipping remote snapshot upsert`
  );
}

async function safeReadJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function deriveFromWebsite(website) {
  if (!website?.wooCommerce?.recentOrders?.length) return [];
  return website.wooCommerce.recentOrders.slice(0, 3).map((order) => ({
    platform: 'Website referral',
    title: `Order from ${order.customer || 'collector'}`,
    format: 'Case study',
    date: order.date,
    metrics: `Total $${order.total}`,
    engagement: 'High intent buyer',
    collectorSignal: 'Recent purchaser',
    why: 'Highlight the story behind a recent collector to attract similar buyers.',
    nextIdea: `Share a behind-the-scenes post about ${order.customer || 'this collector'} and the artwork they chose.`,
    confidence: 'medium',
    source: 'WooCommerce recent orders',
    status: 'new'
  }));
}

function normalizeManualEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    platform: entry.platform ?? 'Instagram',
    title: entry.title ?? 'Untitled post',
    format: entry.format ?? 'Image',
    date: entry.date ?? new Date().toISOString(),
    metrics: entry.metrics ?? '',
    engagement: entry.engagement ?? '',
    collectorSignal: entry.collectorSignal ?? '',
    why: entry.why ?? 'Audience engaged strongly with this concept.',
    nextIdea: entry.nextIdea ?? 'Create a follow-up piece expanding this story.',
    confidence: entry.confidence ?? 'medium',
    source: entry.source ?? 'manual_input',
    status: entry.status ?? 'review'
  }));
}

async function appendLog(entry) {
  const payload = { timestamp: new Date().toISOString(), ...entry };
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(payload) + '\n');
}

async function main() {
  const website = await safeReadJson(WEBSITE_JSON);
  const manualInput = await safeReadJson(MANUAL_INPUT);

  const insights = [...deriveFromWebsite(website), ...normalizeManualEntries(manualInput ?? [])];

  const sourceDetails = {
    websiteDerivedCount: deriveFromWebsite(website).length,
    manualEntryCount: (manualInput ?? []).length,
    hasManualInput: Boolean(manualInput && manualInput.length),
    earliestManualEntry: manualInput && manualInput.length ? manualInput[manualInput.length - 1]?.date ?? null : null,
    latestManualEntry: manualInput && manualInput.length ? manualInput[0]?.date ?? null : null,
    lastWebsiteSnapshot: website?.generatedAt ?? website?.ga4?.generatedAt ?? null
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: sourceDetails.hasManualInput ? 'PARTIAL' : 'FALLBACK',
    source: sourceDetails.hasManualInput ? 'manual_input' : 'website_only',
    insights,
    sourceDetails
  };

  await fs.mkdir(path.join(DASHBOARD_ROOT, 'data', 'social'), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await appendLog({ status: 'success', insightCount: insights.length });
  console.log('[social] Social intelligence snapshot written');

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('dashboard_snapshots')
        .upsert({
          key: 'social',
          payload,
          mode: payload.mode,
          generated_at: payload.generatedAt
        });
      if (error) {
        console.error('[social] Supabase snapshot upsert failed:', error.message);
        await appendLog({ status: 'warning', message: `supabase upsert failed: ${error.message}` });
      } else {
        console.log('[social] Supabase dashboard snapshot updated (social)');
      }
    } catch (error) {
      console.error('[social] Supabase snapshot upsert threw:', error instanceof Error ? error.message : error);
    }
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[social] Failed:', message);
  process.exit(1);
});

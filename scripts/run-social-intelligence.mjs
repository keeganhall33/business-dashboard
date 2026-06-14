#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const WEBSITE_JSON = path.join(DASHBOARD_ROOT, 'data', 'website', 'latest.json');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'social', 'manual_input.json');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'social', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'social_intelligence.log');

async function safeReadJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
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

  const payload = {
    generatedAt: new Date().toISOString(),
    insights
  };

  await fs.mkdir(path.join(DASHBOARD_ROOT, 'data', 'social'), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await appendLog({ status: 'success', insightCount: insights.length });
  console.log('[social] Social intelligence snapshot written');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[social] Failed:', message);
  process.exit(1);
});

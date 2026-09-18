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

const LEGACY_LIMITATIONS = Object.freeze([
  'Legacy social:run uses manual observations, not proven live first-party platform ingestion',
  'Legacy observations cannot establish channel metric completeness or source freshness',
  'Website or commerce activity is not converted into social performance evidence',
  'Legacy observations cannot establish cross-platform attribution or competitor performance'
]);

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

function stringOrNull(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function isoOrNull(value) {
  const normalized = stringOrNull(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function normalizeManualEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => ({
      observationId: stringOrNull(entry.observationId) ?? `manual:${index + 1}`,
      platform: stringOrNull(entry.platform),
      title: stringOrNull(entry.title),
      format: stringOrNull(entry.format),
      date: isoOrNull(entry.date),
      metrics: stringOrNull(entry.metrics),
      engagement: stringOrNull(entry.engagement),
      collectorSignal: stringOrNull(entry.collectorSignal),
      why: stringOrNull(entry.why),
      nextIdea: stringOrNull(entry.nextIdea),
      confidence: stringOrNull(entry.confidence),
      status: stringOrNull(entry.status),
      source: 'manual_input',
      evidenceState: 'MANUAL_UNVERIFIED',
      liveFirstPartyData: false,
      providerEvidenceRefs: []
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
  const insights = normalizeManualEntries(manualInput ?? []);

  const sourceDetails = {
    manualEntryCount: Array.isArray(manualInput) ? manualInput.length : 0,
    normalizedManualEntryCount: insights.length,
    hasManualInput: insights.length > 0,
    earliestManualEntry: insights.map((entry) => entry.date).filter(Boolean).sort()[0] ?? null,
    latestManualEntry: insights.map((entry) => entry.date).filter(Boolean).sort().at(-1) ?? null,
    websiteSnapshotPresent: Boolean(website),
    lastWebsiteSnapshot: website?.generatedAt ?? website?.ga4?.generatedAt ?? null,
    websiteDerivedCount: 0,
    websiteDataUsedForSocialMetrics: false
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: 'SCAFFOLDED',
    operationalState: 'SCAFFOLDED',
    source: sourceDetails.hasManualInput ? 'manual_input' : 'none',
    liveFirstPartyData: false,
    coverageState: 'AVAILABLE_NEEDS_IMPLEMENTATION',
    insights,
    sourceDetails,
    limitations: LEGACY_LIMITATIONS,
    externalSocialAccessPerformed: false,
    platformMutationPerformed: false
  };

  await fs.mkdir(path.join(DASHBOARD_ROOT, 'data', 'social'), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await appendLog({
    status: 'success',
    operationalState: payload.operationalState,
    liveFirstPartyData: false,
    insightCount: insights.length
  });
  console.log('[social] Scaffolded legacy social snapshot written; live first-party data not proven');

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
        console.log('[social] Supabase dashboard snapshot updated (social scaffold)');
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

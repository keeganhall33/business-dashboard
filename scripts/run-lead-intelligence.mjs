#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const HUBSPOT_CACHE = path.join(DASHBOARD_ROOT, 'data', 'leads', 'hubspot_snapshot.json');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'leads', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'lead_intelligence.log');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'leads', 'manual_input.json');

const CATEGORIES = [
  'sports executives',
  'team retail',
  'team foundations',
  'athlete foundations',
  'music foundations',
  'record labels',
  'artist management',
  'brand sponsorships',
  'collectibles/memorabilia',
  'college athletics',
  'NIL collectives',
  'pnw opportunities',
  'japan/global brands'
];

async function safeReadJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function normalizeLead(entry) {
  return {
    name: entry.name ?? null,
    organization: entry.organization ?? null,
    title: entry.title ?? null,
    category: entry.category ?? 'uncategorized',
    opportunityType: entry.opportunityType ?? 'general',
    sourceUrl: entry.sourceUrl ?? null,
    evidence: entry.evidence ?? 'Needs evidence',
    whyItMatters: entry.whyItMatters ?? 'Explain why this lead aligns with Keegan\'s strategy.',
    angle: entry.angle ?? 'Draft potential collaboration angle.',
    introPath: entry.introPath ?? 'unknown',
    pathType: entry.pathType ?? 'unknown',
    priority: entry.priority ?? 'medium',
    confidence: entry.confidence ?? 'medium',
    status: entry.status ?? 'review',
    hubspotId: entry.hubspotId ?? null,
    nextAction: entry.nextAction ?? 'Research credibility and contact route.',
    owner: entry.owner ?? 'Lead Intelligence',
    lastReviewed: entry.lastReviewed ?? new Date().toISOString(),
    notes: entry.notes ?? ''
  };
}

function buildLeadQueue(manualLeads, hubspotLeads) {
  const queue = [];
  if (Array.isArray(manualLeads)) {
    manualLeads.forEach((lead) => queue.push(normalizeLead({ ...lead, source: 'manual_input' })));
  }
  if (Array.isArray(hubspotLeads)) {
    hubspotLeads.forEach((lead) => queue.push(normalizeLead({ ...lead, source: 'hubspot_snapshot' })));
  }
  return queue;
}

function summarizeCategories(leads) {
  const counts = {};
  leads.forEach((lead) => {
    const category = lead.category ?? 'uncategorized';
    counts[category] = (counts[category] ?? 0) + 1;
  });
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function topLeads(leads, filterFn) {
  return leads.filter(filterFn).slice(0, 5);
}

async function appendLog(entry) {
  const payload = { timestamp: new Date().toISOString(), ...entry };
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(payload) + '\n');
}

async function main() {
  const [manualInput, hubspotSnapshot] = await Promise.all([
    safeReadJson(MANUAL_INPUT),
    safeReadJson(HUBSPOT_CACHE)
  ]);

  const leads = buildLeadQueue(manualInput ?? [], hubspotSnapshot ?? []);

  const payload = {
    generatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    leads,
    summary: {
      categories: summarizeCategories(leads),
      warmIntros: topLeads(leads, (lead) => lead.pathType === 'warm'),
      highPriority: topLeads(leads, (lead) => lead.priority === 'high'),
      researchNeeded: topLeads(leads, (lead) => lead.status === 'review' && lead.confidence === 'low')
    }
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await appendLog({ status: 'success', leadCount: leads.length });
  console.log('[leads] Lead intelligence snapshot written');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[leads] Failed:', message);
  process.exit(1);
});

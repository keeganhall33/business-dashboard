#!/usr/bin/env node
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'csv-parse/sync';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const WEBSITE_JSON = path.join(DASHBOARD_ROOT, 'data', 'website', 'latest.json');
const META_JSON = path.join(DASHBOARD_ROOT, 'data', 'meta', 'latest.json');
const CLOUDFLARE_JSON = path.join(DASHBOARD_ROOT, 'data', 'cloudflare', 'latest.json');
const EXEC_OUTPUT = path.join(DASHBOARD_ROOT, 'data', 'executive', 'latest.json');
const EXEC_LOG = path.join(DASHBOARD_ROOT, 'logs', 'executive_command.log');
const DATA_SOURCE_CSV = path.join(DASHBOARD_ROOT, 'data_source_access_matrix.csv');
const AGENT_STATUS_CSV = path.join(DASHBOARD_ROOT, 'agent_status_panel.csv');
const AUTOMATION_STATUS_CSV = path.join(DASHBOARD_ROOT, 'automation_status_panel.csv');
const SOCIAL_JSON = path.join(DASHBOARD_ROOT, 'data', 'social', 'latest.json');
const LEADS_JSON = path.join(DASHBOARD_ROOT, 'data', 'leads', 'latest.json');

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function readCsv(file) {
  try {
    const raw = readFileSync(file, 'utf8');
    return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  } catch (error) {
    return [];
  }
}

function summarizeWebsite(snapshot) {
  if (!snapshot) {
    return { available: false, message: 'Website snapshot missing' };
  }
  const revenue = snapshot.wooCommerce?.totalRevenue ?? null;
  const orders = snapshot.wooCommerce?.orderCount ?? null;
  const topProduct = snapshot.wooCommerce?.topProducts?.[0]?.name ?? null;
  const sessions = snapshot.ga4?.sessions ?? null;
  const purchases = snapshot.ga4?.ecommercePurchases ?? null;
  const warnings = snapshot.ga4?.warnings ?? [];
  return { available: true, revenue, orders, topProduct, sessions, purchases, warnings };
}

function summarizeMeta(snapshot) {
  if (!snapshot) {
    return { available: false, message: 'Meta snapshot missing' };
  }
  const spend = snapshot.summary?.spend ?? null;
  const impressions = snapshot.summary?.impressions ?? null;
  const clicks = snapshot.summary?.clicks ?? null;
  const roas = snapshot.summary?.roas ?? null;
  const purchases = snapshot.summary?.purchases ?? null;
  return { available: true, spend, impressions, clicks, roas, purchases };
}

function comparisonSummary(website, meta) {
  return {
    caveat: 'Directional comparison only. Meta, GA4, and WooCommerce attribution may differ.',
    metaSpend: meta?.spend ?? null,
    metaClicks: meta?.clicks ?? null,
    metaImpressions: meta?.impressions ?? null,
    ga4Sessions: website?.sessions ?? null,
    wooRevenue: website?.revenue ?? null,
    wooOrders: website?.orders ?? null,
    blendedRoas: meta?.spend ? (website?.revenue ?? 0) / meta.spend : null
  };
}

function buildDataSourceHealth(rows) {
  return rows.map((row) => ({
    name: row['Data Source'] ?? 'Unknown',
    status: row['Status'] ?? 'Unknown',
    lastVerified: row['Last Verified'] ?? null,
    notes: row['Notes / Action Required'] ?? null
  }));
}

function buildAgentHealth(rows) {
  return rows.map((row) => ({
    agent: row['Agent Name'] ?? 'Unknown',
    cadence: row['Cadence'] ?? null,
    lastRun: row['Last Run Timestamp'] ?? null,
    runStatus: row['Run Status'] ?? null,
    nextRun: row['Next Scheduled Run'] ?? null,
    issues: row['Issues/Notes'] ?? null
  }));
}

function buildAutomationHealth(rows) {
  return rows.map((row) => ({
    job: row['Job Name'] ?? 'Unknown',
    frequency: row['Frequency'] ?? null,
    lastRun: row['Last Run Timestamp'] ?? null,
    result: row['Last Run Result'] ?? null,
    nextRun: row['Next Run'] ?? null,
    alertStatus: row['Alert Status'] ?? null,
    notes: row['Notes/Blockers'] ?? null
  }));
}

function recommendActions(website, meta, dataSources) {
  const actions = [];
  if (!website?.available) {
    actions.push({
      action: 'Restore Website snapshot',
      why: 'Executive view cannot summarize revenue without the latest Website data.',
      source: 'dashboard/data/website/latest.json',
      confidence: 'high',
      owner: 'Automation',
      timing: 'immediate'
    });
  }
  if (website?.warnings?.some((w) => w.toLowerCase().includes('addtocart'))) {
    actions.push({
      action: 'Configure GA4 add_to_cart tracking',
      why: 'WooCommerce revenue is flowing but GA4 add-to-cart events are unavailable, blocking funnel diagnostics.',
      source: 'GA4 warning',
      confidence: 'high',
      owner: 'Website & Conversion',
      timing: 'this week'
    });
  }
  if (meta?.available && meta.spend > 0 && (!meta.purchases || meta.purchases === 0)) {
    actions.push({
      action: 'Review Meta campaign outcomes',
      why: `Meta spent $${meta.spend} in the last period but reported 0 purchases; investigate targeting/creative before increasing spend.`,
      source: 'Meta insights',
      confidence: 'medium',
      owner: 'Meta Ads',
      timing: 'this week'
    });
  }
  const pendingSource = dataSources.find((row) => /pending|unknown|inaccessible/i.test(row.status ?? ''));
  if (pendingSource) {
    actions.push({
      action: `Resolve ${pendingSource.name} data access`,
      why: pendingSource.notes || 'Data source marked pending and blocks future automation.',
      source: 'Data source matrix',
      confidence: 'medium',
      owner: 'Ops',
      timing: 'this week'
    });
  }
  if (!actions.length) {
    actions.push({
      action: 'Review top-selling product page',
      why: 'Revenue and spends are active; refine the best-performing SKU to keep momentum.',
      source: 'Website snapshot',
      confidence: 'low',
      owner: 'Website & Conversion',
      timing: 'next 7 days'
    });
  }
  const fallbacks = [
    {
      action: 'Confirm scheduler secrets and env templates',
      why: 'Automation needs production secrets to run without manual intervention.',
      source: 'Scheduler checklist',
      confidence: 'medium',
      owner: 'Ops',
      timing: 'this week'
    },
    {
      action: 'Document Executive refresh deployment plan',
      why: 'Executive panel depends on timely Website/Meta jobs; ensure ops knows how to verify output.',
      source: 'Executive summary',
      confidence: 'medium',
      owner: 'Ops',
      timing: 'next 7 days'
    }
  ];
  for (const fallback of fallbacks) {
    if (actions.length >= 5) break;
    actions.push(fallback);
  }
  return actions.slice(0, 5);
}

function collectBlockedItems(dataSources) {
  return dataSources
    .filter((row) => /pending|unknown|inaccessible/i.test(row.status ?? ''))
    .map((row) => ({ name: row.name, detail: row.notes || row.status }));
}

function collectRisks(website, meta) {
  const risks = [];
  if (website?.warnings?.length) {
    risks.push('GA4 funnel metrics incomplete: ' + website.warnings.join('; '));
  }
  if (meta?.available && meta.spend > 0 && (!meta.purchases || meta.purchases === 0)) {
    risks.push('Meta spend without tracked purchases could erode ROAS.');
  }
  return risks;
}

function collectWins(website, meta) {
  const wins = [];
  if (website?.revenue) {
    wins.push(`WooCommerce revenue last snapshot: $${website.revenue.toFixed(2)}`);
  }
  if (meta?.available && meta.spend > 0 && meta.clicks) {
    wins.push(`Meta captured ${meta.clicks} clicks from ${meta.impressions} impressions.`);
  }
  return wins;
}

function decisionsNeeded(dataSources) {
  const decisions = [];
  if (dataSources.some((row) => row.name.toLowerCase().includes('cloudflare') && /pending/i.test(row.status ?? ''))) {
    decisions.push('Confirm whether to provision a read-only Cloudflare API token.');
  }
  if (dataSources.some((row) => row.name.toLowerCase().includes('meta') && /pending/i.test(row.status ?? ''))) {
    decisions.push('Confirm continued Meta reporting scope (read-only).');
  }
  return decisions;
}

async function appendLog(entry) {
  const payload = { timestamp: new Date().toISOString(), ...entry };
  await fs.mkdir(path.dirname(EXEC_LOG), { recursive: true });
  await fs.appendFile(EXEC_LOG, JSON.stringify(payload) + '\n');
}

async function main() {
  const [website, meta, social, leads, cloudflare] = await Promise.all([
    readJson(WEBSITE_JSON),
    readJson(META_JSON),
    readJson(SOCIAL_JSON),
    readJson(LEADS_JSON),
    readJson(CLOUDFLARE_JSON)
  ]);
  const dataSourceRows = readCsv(DATA_SOURCE_CSV);
  const agentRows = readCsv(AGENT_STATUS_CSV);
  const automationRows = readCsv(AUTOMATION_STATUS_CSV);

  const websiteSummary = summarizeWebsite(website);
  const metaSummary = summarizeMeta(meta);
  const comparison = comparisonSummary(websiteSummary, metaSummary);
  const dataSourceHealth = buildDataSourceHealth(dataSourceRows);
  const agentHealth = buildAgentHealth(agentRows);
  const automationHealth = buildAutomationHealth(automationRows);
  const actions = recommendActions(websiteSummary, metaSummary, dataSourceHealth);
  const blockedItems = collectBlockedItems(dataSourceHealth);
  const risks = collectRisks(websiteSummary, metaSummary);
  const wins = collectWins(websiteSummary, metaSummary);
  const socialInsights = Array.isArray(social?.insights) ? social.insights.slice(0, 3) : [];
  const leadSummary = leads?.summary ?? {};
  const leadHighlights = Array.isArray(leadSummary.topOpportunities) ? leadSummary.topOpportunities.slice(0, 3) : [];
  const leadWarmIntros = Array.isArray(leadSummary.warmIntros) ? leadSummary.warmIntros.slice(0, 3) : [];
  const leadResearchNeeded = Array.isArray(leadSummary.researchNeeded) ? leadSummary.researchNeeded.slice(0, 3) : [];
  const leadActions = Array.isArray(leadSummary.recommendedActions) ? leadSummary.recommendedActions.slice(0, 3) : [];
  const leadQuality = leads?.quality ?? {};
  const leadHygiene = {
    missingData: leadSummary.missingData?.length ?? 0,
    stale: leadSummary.stale?.length ?? 0,
    duplicates: leadSummary.duplicates?.length ?? 0,
    highPriorityNoOwner: leadQuality.highPriorityNoOwner?.length ?? 0
  };
  const siteHealthWarnings = cloudflare?.summary?.warnings ?? cloudflare?.warnings ?? [];
  const siteSecurityRisks = cloudflare?.security?.threats ? [`${cloudflare.security.threats} threats flagged in last window`] : [];
  const siteCacheIssues = cloudflare?.summary?.cacheHealth === 'needs attention' ? ['Cache hit rate below 70%'] : [];
  const decisions = decisionsNeeded(dataSourceHealth);

  const payload = {
    generatedAt: new Date().toISOString(),
    websiteSummary,
    metaSummary,
    comparison,
    dataSourceHealth,
    agentHealth,
    automationHealth,
    actions,
    blockedItems,
    risks,
    socialHighlights: socialInsights,
    leadHighlights,
    leadWarmIntros,
    leadResearchNeeded,
    leadActions,
    leadHygiene,
    cloudflare: cloudflare ?? null,
    siteHealthWarnings,
    siteSecurityRisks,
    siteCacheIssues,
    wins,
    decisionsNeeded: decisions
  };

  await fs.mkdir(path.dirname(EXEC_OUTPUT), { recursive: true });
  await fs.writeFile(EXEC_OUTPUT, JSON.stringify(payload, null, 2));
  await appendLog({ status: 'success', actions: actions.length });
  console.log('[executive] Executive summary refreshed');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[executive] Failed:', message);
  process.exit(1);
});

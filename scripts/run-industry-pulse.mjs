#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'industry', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'industry_pulse.log');

const SOURCES = [
  {
    name: 'Sports Business Journal',
    category: 'sports business',
    url: 'https://www.sportsbusinessjournal.com/RSS.aspx'
  },
  {
    name: 'Billboard Music News',
    category: 'music industry',
    url: 'https://www.billboard.com/feed/'
  },
  {
    name: 'ESPN Headlines',
    category: 'athlete milestones',
    url: 'https://www.espn.com/espn/rss/news'
  },
  {
    name: 'Seattle Times Sports',
    category: 'pnw sports',
    url: 'https://www.seattletimes.com/sports/feed/'
  }
];

async function fetchRss(source) {
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const parsed = await parseStringPromise(xml, { trim: true, explicitArray: false });
    const items = parsed?.rss?.channel?.item ?? [];
    return Array.isArray(items) ? items : [items];
  } catch (error) {
    console.warn(`[industry] Failed to fetch ${source.name}:`, error.message ?? error);
    return [];
  }
}

function createAlert(source, item) {
  const title = item?.title ?? 'Opportunity';
  const link = item?.link ?? null;
  const pubDate = item?.pubDate ?? new Date().toISOString();
  const description = item?.description ?? '';
  const why = buildWhy(source.category, description);
  const action = buildAction(source.category);
  return {
    title,
    category: source.category,
    source: source.name,
    sourceUrl: link,
    date: pubDate,
    summary: description,
    whyItMatters: why,
    opportunity: action.opportunity,
    recommendedAction: action.action,
    urgency: action.urgency,
    confidence: action.confidence,
    related: [],
    owner: action.owner,
    status: 'new'
  };
}

function buildWhy(category, description) {
  switch (category) {
    case 'sports business':
      return 'Potential sponsor or team retail tie-in highlighted in sports business coverage.';
    case 'music industry':
      return 'Music industry news can unlock album/tour collaborations.';
    case 'pnw sports':
      return 'Local Seattle/Pacific Northwest story with high cultural affinity.';
    default:
      return description ? description.slice(0, 200) : 'Relevant cultural event for Keegan Hall Studio.';
  }
}

function buildAction(category) {
  if (category === 'sports business') {
    return {
      opportunity: 'Sponsor / team retail collaboration',
      action: 'Assess whether the mentioned sponsor or team aligns with Keegan\'s premium art.',
      urgency: 'medium',
      confidence: 'medium',
      owner: 'Partnerships'
    };
  }
  if (category === 'music industry') {
    return {
      opportunity: 'Album/tour commemorative art',
      action: 'Evaluate whether the referenced artist/tour fits the story-driven portfolio.',
      urgency: 'medium',
      confidence: 'medium',
      owner: 'Creative'
    };
  }
  if (category === 'pnw sports') {
    return {
      opportunity: 'Local collector campaign',
      action: 'Consider a limited-run drop or charity tie-in around this local moment.',
      urgency: 'high',
      confidence: 'high',
      owner: 'Seattle Ops'
    };
  }
  return {
    opportunity: 'Research opportunity',
    action: 'Review and classify this alert.',
    urgency: 'low',
    confidence: 'low',
    owner: 'Research'
  };
}

async function appendLog(entry) {
  const payload = { timestamp: new Date().toISOString(), ...entry };
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.appendFile(LOG_PATH, JSON.stringify(payload) + '\n');
}

async function main() {
  const alerts = [];
  for (const source of SOURCES) {
    const items = await fetchRss(source);
    items.slice(0, 2).forEach((item) => alerts.push(createAlert(source, item)));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map((s) => ({ name: s.name, url: s.url, category: s.category })),
    alerts
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await appendLog({ status: 'success', alertCount: alerts.length });
  console.log('[industry] Industry pulse updated');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[industry] Failed:', message);
  process.exit(1);
});

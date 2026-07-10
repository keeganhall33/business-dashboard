#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const DASHBOARD_ROOT = path.resolve('../dashboard');
const HUBSPOT_CACHE = path.join(DASHBOARD_ROOT, 'data', 'leads', 'hubspot_snapshot.json');
const OUTPUT_PATH = path.join(DASHBOARD_ROOT, 'data', 'leads', 'latest.json');
const LOG_PATH = path.join(DASHBOARD_ROOT, 'logs', 'lead_intelligence.log');
const MANUAL_INPUT = path.join(DASHBOARD_ROOT, 'data', 'leads', 'manual_input.json');
const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;
const STALE_DAYS = 45;
const MS_PER_DAY = 86_400_000;
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

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

async function fetchHubspotObjects(object, properties = [], limit = 50) {
  if (!HUBSPOT_TOKEN) return [];
  try {
    const url = new URL(`https://api.hubapi.com/crm/v3/objects/${object}`);
    url.searchParams.set('limit', String(limit));
    if (properties.length) {
      url.searchParams.set('properties', properties.join(','));
    }
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HubSpot ${object} fetch failed: ${response.status} ${text}`);
    }
    const json = await response.json();
    return json.results ?? [];
  } catch (error) {
    await appendLog({ status: 'warning', message: String(error) });
    return [];
  }
}

function leadsFromCompanies(companies) {
  return companies.map((company) => {
    const props = company.properties ?? {};
    return normalizeLead({
      name: props.name ?? null,
      organization: props.name ?? props.domain ?? null,
      title: props.industry ?? null,
      category: props.keegan_category,
      opportunityType: props.keegan_opportunity_type,
      sourceUrl: props.website ?? null,
      evidence: props.keegan_evidence,
      whyItMatters: props.keegan_why,
      angle: props.keegan_angle,
      introPath: props.keegan_intro_path,
      pathType: props.keegan_path_type,
      priority: props.keegan_priority,
      confidence: props.keegan_confidence,
      status: props.keegan_status,
      hubspotId: company.id,
      nextAction: props.keegan_next_action,
      owner: props.keegan_owner,
      lastReviewed: props.keegan_last_reviewed,
      dueDate: props.keegan_due_date,
      notes: props.keegan_notes,
      sourceType: 'company'
    });
  });
}

function leadsFromContacts(contacts) {
  return contacts.map((contact) => {
    const props = contact.properties ?? {};
    return normalizeLead({
      name: `${props.firstname ?? ''} ${props.lastname ?? ''}`.trim() || null,
      organization: props.company ?? props.associatedcompanyid ?? null,
      title: props.jobtitle ?? null,
      category: props.keegan_category,
      opportunityType: props.keegan_opportunity_type,
      sourceUrl: props.linkedinbio ?? props.website ?? null,
      evidence: props.keegan_evidence,
      whyItMatters: props.keegan_why,
      angle: props.keegan_angle,
      introPath: props.keegan_intro_path,
      pathType: props.keegan_path_type,
      priority: props.keegan_priority,
      confidence: props.keegan_confidence,
      status: props.keegan_status,
      hubspotId: contact.id,
      nextAction: props.keegan_next_action,
      owner: props.hubspot_owner_id ?? props.keegan_owner,
      lastReviewed: props.keegan_last_reviewed,
      dueDate: props.keegan_due_date,
      notes: props.keegan_notes,
      sourceType: 'contact'
    });
  });
}

function leadsFromDeals(deals) {
  return deals.map((deal) => {
    const props = deal.properties ?? {};
    return normalizeLead({
      name: props.dealname ?? null,
      organization: props.associatedcompanyid ?? null,
      title: props.pipeline ?? null,
      category: props.keegan_category,
      opportunityType: props.dealstage ?? props.keegan_opportunity_type,
      sourceUrl: null,
      evidence: props.keegan_evidence,
      whyItMatters: props.keegan_why,
      angle: props.keegan_angle,
      introPath: props.keegan_intro_path,
      pathType: props.keegan_path_type,
      priority: props.keegan_priority,
      confidence: props.keegan_confidence,
      status: props.keegan_status ?? props.dealstage,
      hubspotId: deal.id,
      nextAction: props.keegan_next_action,
      owner: props.hubspot_owner_id ?? props.keegan_owner,
      lastReviewed: props.keegan_last_reviewed,
      dueDate: props.closedate,
      notes: props.keegan_notes,
      sourceType: 'deal'
    });
  });
}

function leadsFromTasks(tasks) {
  return tasks.map((task) => {
    const props = task.properties ?? {};
    return normalizeLead({
      name: props.hs_task_body ?? task.id,
      organization: props.keegan_target_org ?? null,
      title: props.hs_task_subject ?? 'Task',
      category: props.keegan_category,
      opportunityType: props.hs_task_type ?? 'task',
      sourceUrl: props.keegan_evidence_link ?? null,
      evidence: props.keegan_evidence,
      whyItMatters: props.keegan_why,
      angle: props.keegan_angle,
      introPath: props.keegan_intro_path,
      pathType: props.keegan_path_type,
      priority: props.keegan_priority ?? props.hs_task_priority,
      confidence: props.keegan_confidence,
      status: props.keegan_status ?? props.hs_task_status,
      hubspotId: task.id,
      nextAction: props.keegan_next_action ?? props.hs_task_body,
      owner: props.hubspot_owner_id ?? props.keegan_owner,
      lastReviewed: props.keegan_last_reviewed,
      dueDate: props.hs_task_due_date,
      notes: props.keegan_notes,
      sourceType: 'task'
    });
  });
}

function normalizeLead(entry) {
  const issues = [];
  if (!entry.category) issues.push('missing_category');
  if (!entry.status) issues.push('missing_status');
  if (!entry.evidence) issues.push('missing_evidence');
  if (!entry.nextAction) issues.push('missing_next_action');
  if (!entry.owner) issues.push('missing_owner');
  if (!entry.sourceUrl) issues.push('missing_source');

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
    dueDate: entry.dueDate ?? null,
    notes: entry.notes ?? '',
    sourceType: entry.sourceType ?? entry.source ?? 'manual',
    issues
  };
}

function buildLeadQueue(manualLeads, hubspotLeads) {
  const queue = [];
  if (Array.isArray(manualLeads)) {
    manualLeads.forEach((lead) => queue.push(normalizeLead({ ...lead, source: 'manual_input' })));
  }
  if (Array.isArray(hubspotLeads)) {
    hubspotLeads.forEach((lead) => queue.push(normalizeLead({ ...lead, source: lead.source ?? 'hubspot_snapshot' })));
  }
  return queue;
}

function evaluateLead(lead) {
  const issues = new Set(lead.issues ?? []);
  if (!lead.sourceUrl) issues.add('missing_source');
  if (!lead.evidence || lead.evidence.toLowerCase().includes('needs evidence')) issues.add('missing_evidence');
  if (!lead.nextAction || lead.nextAction.toLowerCase().includes('research')) issues.add('missing_next_action');
  if (!lead.owner || lead.owner === 'Lead Intelligence') issues.add('missing_owner');
  if (lead.priority === 'high' && (!lead.owner || lead.owner === 'Lead Intelligence')) {
    issues.add('high_priority_no_owner');
  }

  let daysSinceReview = null;
  if (lead.lastReviewed) {
    const last = new Date(lead.lastReviewed).getTime();
    if (!Number.isNaN(last)) {
      daysSinceReview = Math.round((Date.now() - last) / MS_PER_DAY);
      if (daysSinceReview > STALE_DAYS) {
        issues.add('stale');
      }
    } else {
      issues.add('stale');
    }
  } else {
    issues.add('stale');
  }

  return { ...lead, issues: Array.from(issues), daysSinceReview };
}

function detectDuplicates(leads) {
  const map = new Map();
  leads.forEach((lead) => {
    const key = `${lead.organization ?? ''}|${lead.name ?? ''}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(lead);
  });
  return Array.from(map.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, leads: group }));
}

function compactLead(lead) {
  return {
    name: lead.name,
    organization: lead.organization,
    priority: lead.priority,
    status: lead.status,
    hubspotId: lead.hubspotId,
    pathType: lead.pathType,
    nextAction: lead.nextAction,
    owner: lead.owner
  };
}

function dedupeCompact(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.organization ?? ''}|${item.name ?? ''}|${item.nextAction ?? ''}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function buildQualityReport(leads) {
  const pick = (predicate) => leads.filter(predicate).map(compactLead);
  return {
    missingCategory: pick((lead) => lead.issues?.includes('missing_category')),
    missingStatus: pick((lead) => lead.issues?.includes('missing_status')),
    missingEvidence: pick((lead) => lead.issues?.includes('missing_evidence')),
    missingNextAction: pick((lead) => lead.issues?.includes('missing_next_action')),
    missingOwner: pick((lead) => lead.issues?.includes('missing_owner')),
    warmIntros: pick((lead) => lead.pathType === 'warm'),
    staleLeads: pick((lead) => lead.issues?.includes('stale')),
    highPriorityNoOwner: pick((lead) => lead.issues?.includes('high_priority_no_owner')),
    duplicates: detectDuplicates(leads)
  };
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

  let liveCompaniesRaw = [];
  let liveContactsRaw = [];
  let liveDealsRaw = [];
  let liveTasksRaw = [];

  if (HUBSPOT_TOKEN) {
    await appendLog({ status: 'info', message: 'HubSpot live read attempted. Writes disabled.' });
    [liveCompaniesRaw, liveContactsRaw, liveDealsRaw, liveTasksRaw] = await Promise.all([
      fetchHubspotObjects('companies', [
        'name',
        'industry',
        'domain',
        'website',
        'keegan_category',
        'keegan_opportunity_type',
        'keegan_evidence',
        'keegan_why',
        'keegan_angle',
        'keegan_intro_path',
        'keegan_path_type',
        'keegan_priority',
        'keegan_confidence',
        'keegan_status',
        'keegan_next_action',
        'keegan_owner',
        'keegan_last_reviewed',
        'keegan_notes',
        'keegan_due_date'
      ], 100),
      fetchHubspotObjects('contacts', [
        'firstname',
        'lastname',
        'company',
        'associatedcompanyid',
        'jobtitle',
        'linkedinbio',
        'website',
        'keegan_category',
        'keegan_opportunity_type',
        'keegan_evidence',
        'keegan_why',
        'keegan_angle',
        'keegan_intro_path',
        'keegan_path_type',
        'keegan_priority',
        'keegan_confidence',
        'keegan_status',
        'keegan_next_action',
        'keegan_owner',
        'keegan_last_reviewed',
        'keegan_notes',
        'keegan_due_date'
      ], 100),
      fetchHubspotObjects('deals', [
        'dealname',
        'dealstage',
        'pipeline',
        'associatedcompanyid',
        'amount',
        'keegan_category',
        'keegan_opportunity_type',
        'keegan_evidence',
        'keegan_why',
        'keegan_angle',
        'keegan_intro_path',
        'keegan_path_type',
        'keegan_priority',
        'keegan_confidence',
        'keegan_status',
        'keegan_next_action',
        'keegan_owner',
        'keegan_last_reviewed',
        'keegan_notes'
      ], 100),
      fetchHubspotObjects('tasks', [
        'hs_task_body',
        'hs_task_subject',
        'hs_task_status',
        'hs_task_type',
        'hs_task_priority',
        'hs_task_due_date',
        'hubspot_owner_id',
        'keegan_category',
        'keegan_opportunity_type',
        'keegan_evidence',
        'keegan_evidence_link',
        'keegan_why',
        'keegan_angle',
        'keegan_intro_path',
        'keegan_path_type',
        'keegan_priority',
        'keegan_confidence',
        'keegan_status',
        'keegan_next_action',
        'keegan_owner',
        'keegan_last_reviewed',
        'keegan_notes',
        'keegan_target_org'
      ], 100)
    ]);
  } else {
    await appendLog({ status: 'info', message: 'No HUBSPOT_ACCESS_TOKEN detected. Falling back to snapshot/manual mode.' });
  }

  const liveHubspotLeads = [
    ...leadsFromCompanies(liveCompaniesRaw),
    ...leadsFromContacts(liveContactsRaw),
    ...leadsFromDeals(liveDealsRaw),
    ...leadsFromTasks(liveTasksRaw)
  ];

  const snapshotLeads = Array.isArray(hubspotSnapshot) ? hubspotSnapshot : [];
  const leads = buildLeadQueue(manualInput ?? [], [...snapshotLeads, ...liveHubspotLeads]).map(evaluateLead);

  const quality = buildQualityReport(leads);

  const scoreLead = (lead) => {
    const base = PRIORITY_WEIGHT[lead.priority] ?? 1;
    const confidenceBoost = lead.confidence === 'high' ? 1.3 : lead.confidence === 'low' ? 0.8 : 1;
    const introBoost = lead.pathType === 'warm' ? 1.2 : 1;
    return base * confidenceBoost * introBoost;
  };

  const sortByScore = (arr) => [...arr].sort((a, b) => scoreLead(b) - scoreLead(a));
  const recommendedActions = sortByScore(leads).slice(0, 5).map(compactLead);

  const summary = {
    categories: summarizeCategories(leads),
    warmIntros: (quality.warmIntros ?? []).slice(0, 5),
    topOpportunities: sortByScore(leads).slice(0, 5),
    researchNeeded: leads.filter((lead) => lead.issues?.some((issue) => ['missing_evidence', 'missing_next_action'].includes(issue))).slice(0, 5),
    missingData: dedupeCompact([
      ...quality.missingCategory,
      ...quality.missingStatus,
      ...quality.missingEvidence,
      ...quality.missingNextAction
    ]).slice(0, 5),
    stale: (quality.staleLeads ?? []).slice(0, 5),
    duplicates: (quality.duplicates ?? []).slice(0, 3),
    recommendedActions
  };

  const recordCounts = {
    manual: Array.isArray(manualInput) ? manualInput.length : 0,
    snapshot: snapshotLeads.length,
    hubspot: {
      companies: liveCompaniesRaw.length,
      contacts: liveContactsRaw.length,
      deals: liveDealsRaw.length,
      tasks: liveTasksRaw.length
    }
  };

  const hasLiveHubspotData = Boolean(HUBSPOT_TOKEN) &&
    (liveCompaniesRaw.length || liveContactsRaw.length || liveDealsRaw.length || liveTasksRaw.length);
  const mode = hasLiveHubspotData ? 'hubspot-live' : 'snapshot';
  const supabaseMode = hasLiveHubspotData && leads.length ? 'LIVE' : 'PARTIAL';

  const payload = {
    generatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    leads,
    summary,
    quality,
    meta: { mode, recordCounts }
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  if (supabaseClient) {
    await upsertSupabaseSnapshot(payload, supabaseMode);
  } else {
    console.log('[leads] Supabase env not configured; snapshot stored locally only.');
  }
  await appendLog({ status: 'success', leadCount: leads.length, mode, recordCounts });
  console.log('[leads] Lead intelligence snapshot written');
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await appendLog({ status: 'error', message });
  console.error('[leads] Failed:', message);
  process.exit(1);
});

async function upsertSupabaseSnapshot(snapshot, mode) {
  if (!supabaseClient || !snapshot) return;
  try {
    const { error } = await supabaseClient
      .from('dashboard_snapshots')
      .upsert({
        key: 'lead_intelligence',
        payload: snapshot,
        mode,
        generated_at: snapshot.generatedAt ?? null
      });
    if (error) {
      console.error('[leads] Supabase dashboard snapshot upsert failed:', error.message);
    } else {
      console.log('[leads] Supabase dashboard snapshot updated (lead_intelligence)');
    }
  } catch (error) {
    console.error('[leads] Supabase dashboard snapshot upsert threw:', error instanceof Error ? error.message : error);
  }
}

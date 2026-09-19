#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import {
  buildMetaGraphUrlV1,
  fetchAllMetaInsightPagesV1,
  META_GRAPH_API_VERSION_V1,
} from './lib/meta-insights-pagination-v1.mjs';
import {
  buildMetaAdFixedWindowPlanV1,
  META_AD_INSIGHT_FIELDS_V1,
  META_CAMPAIGN_INSIGHT_FIELDS_V1,
  summarizeMetaAdInsightV1,
  summarizeMetaCampaignInsightV1,
} from './lib/meta-ad-fixed-window-v1.mjs';

const REQUIRED_ENV_VARS = ['META_ACCESS_TOKEN'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[meta-agent] Missing env var: ${key}`);
    process.exit(1);
  }
}

const accessToken = process.env.META_ACCESS_TOKEN.trim();
const configuredAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
const rawReportDays = Number(process.env.META_REPORT_DAYS ?? 7);
if (!Number.isSafeInteger(rawReportDays) || rawReportDays < 1 || rawReportDays > 365) {
  console.error('[meta-agent] META_REPORT_DAYS must be a safe integer between 1 and 365');
  process.exit(1);
}
const reportDays = rawReportDays;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseClient = supabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
if (!supabaseEnabled) {
  console.warn(
    `[meta-agent] Supabase env missing; urlPresent=${Boolean(supabaseUrl)} keyPresent=${Boolean(supabaseServiceRoleKey)} - skipping remote snapshot upsert`
  );
}

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, 'dashboard', 'data', 'meta', 'latest.json');
const logPath = path.join(repoRoot, 'dashboard', 'logs', 'meta_ads_agent.log');
const DAY_MS = 24 * 60 * 60 * 1_000;

function appendLog(payload) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...payload });
  return fs.mkdir(path.dirname(logPath), { recursive: true })
    .then(() => fs.appendFile(logPath, line + '\n'));
}

async function sendSchedulerAlert(payload) {
  const secret = process.env.SCHEDULER_SECRET?.trim();
  const url = process.env.SCHEDULER_ALERT_URL?.trim();
  if (!secret || !url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-scheduler-secret': secret },
      body: JSON.stringify({ agentKey: 'meta_ads_reporting', ...payload })
    });
  } catch (error) {
    console.warn('[meta-agent] Failed to send scheduler alert:', error instanceof Error ? error.message : error);
  }
}

function rangeEndingOnCompleteDate(days, completeThrough) {
  const endMs = Date.parse(`${completeThrough}T00:00:00.000Z`);
  if (!Number.isFinite(endMs)) {
    throw new Error('Meta complete-through date is invalid');
  }
  return Object.freeze({
    startDate: new Date(endMs - (days - 1) * DAY_MS).toISOString().slice(0, 10),
    endDate: completeThrough,
  });
}

async function resolveAccountId() {
  if (configuredAccountId) {
    return configuredAccountId.replace(/^act_/, '');
  }

  const url = buildMetaGraphUrlV1('/me/adaccounts');
  url.searchParams.set('fields', 'id,name');
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list ad accounts (${response.status} ${response.statusText}): ${text}`);
  }

  const json = await response.json();
  const accountId = json?.data?.[0]?.id;
  if (!accountId) {
    throw new Error('No ad accounts accessible with this token');
  }
  return String(accountId).replace(/^act_/, '');
}

async function fetchInsightRange({ adAccountId, level, fields, reportingRange }) {
  const url = buildMetaGraphUrlV1(`/act_${adAccountId}/insights`);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('level', level);
  url.searchParams.set(
    'time_range',
    JSON.stringify({ since: reportingRange.startDate, until: reportingRange.endDate })
  );

  const result = await fetchAllMetaInsightPagesV1({
    initialUrl: url.toString(),
    accessToken,
    fetchImpl: fetch,
  });
  return { ...result, reportingRange };
}

async function fetchCampaignInsights(adAccountId, reportingRange) {
  return fetchInsightRange({
    adAccountId,
    level: 'campaign',
    fields: META_CAMPAIGN_INSIGHT_FIELDS_V1,
    reportingRange,
  });
}

async function fetchAdFixedWindows(adAccountId, plan) {
  const windows = [];
  for (const window of plan.windows) {
    const result = await fetchInsightRange({
      adAccountId,
      level: 'ad',
      fields: META_AD_INSIGHT_FIELDS_V1,
      reportingRange: window.range,
    });
    const ads = result.data.map(summarizeMetaAdInsightV1);
    windows.push({
      key: window.key,
      role: window.role,
      days: window.days,
      reportingRange: window.range,
      sourceCompleteness: {
        apiVersion: META_GRAPH_API_VERSION_V1,
        paginationComplete: result.paginationComplete,
        pagesFetched: result.pagesFetched,
        completeThrough: window.range.endDate,
        completedUtcDaysOnly: true,
      },
      ads,
    });
  }
  return Object.freeze(windows);
}

function aggregateCampaigns(campaigns) {
  const totals = campaigns.reduce(
    (acc, campaign) => {
      acc.spend += campaign.spend;
      acc.impressions += campaign.impressions;
      acc.clicks += campaign.clicks;
      if (campaign.purchases === null) acc.purchasesComplete = false;
      else acc.purchases += campaign.purchases;
      if (campaign.purchaseValue === null) acc.purchaseValueComplete = false;
      else acc.purchaseValue += campaign.purchaseValue;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      purchasesComplete: true,
      purchaseValue: 0,
      purchaseValueComplete: true,
    }
  );

  const purchases = totals.purchasesComplete ? totals.purchases : null;
  const purchaseValue = totals.purchaseValueComplete ? totals.purchaseValue : null;
  return Object.freeze({
    spend: totals.spend,
    impressions: totals.impressions,
    clicks: totals.clicks,
    purchases,
    purchaseValue,
    roas: purchaseValue !== null && totals.spend > 0 ? purchaseValue / totals.spend : null,
  });
}

async function main() {
  try {
    const fixedWindowPlan = buildMetaAdFixedWindowPlanV1(new Date());
    const adAccountId = await resolveAccountId();
    const reportingRange = rangeEndingOnCompleteDate(reportDays, fixedWindowPlan.completeThrough);
    const campaignResult = await fetchCampaignInsights(adAccountId, reportingRange);
    const campaigns = campaignResult.data.map(summarizeMetaCampaignInsightV1);
    const adFixedWindows = await fetchAdFixedWindows(adAccountId, fixedWindowPlan);
    const summary = aggregateCampaigns(campaigns);

    const generatedAt = new Date().toISOString();
    const sourceCompleteness = {
      apiVersion: META_GRAPH_API_VERSION_V1,
      paginationComplete: campaignResult.paginationComplete,
      pagesFetched: campaignResult.pagesFetched,
      completeThrough: reportingRange.endDate,
      completedUtcDaysOnly: true,
    };
    const snapshot = {
      generatedAt,
      accountId: `act_${adAccountId}`,
      range: reportDays,
      reportingRange,
      sourceCompleteness,
      campaigns,
      adFixedWindows: {
        generatedAt: fixedWindowPlan.generatedAt,
        completeThrough: fixedWindowPlan.completeThrough,
        windows: adFixedWindows,
      },
      summary,
      status: 'LIVE',
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));
    await upsertSupabaseSnapshot(snapshot);

    const adRows = adFixedWindows.reduce((count, window) => count + window.ads.length, 0);
    const adPagesFetched = adFixedWindows.reduce(
      (count, window) => count + window.sourceCompleteness.pagesFetched,
      0
    );
    await appendLog({
      status: 'success',
      campaigns: campaigns.length,
      adRows,
      adFixedWindows: adFixedWindows.length,
      spend: summary.spend,
      pagesFetched: campaignResult.pagesFetched,
      adPagesFetched,
      completeThrough: fixedWindowPlan.completeThrough,
      apiVersion: META_GRAPH_API_VERSION_V1,
    });
    await sendSchedulerAlert({ status: 'success', message: 'Meta reporting agent completed', spend: summary.spend });
    console.log('[meta-agent] Updated Meta insights snapshot');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendLog({ status: 'error', message });
    await sendSchedulerAlert({ status: 'error', message });
    console.error('[meta-agent] Failed:', message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await main();

async function upsertSupabaseSnapshot(snapshot) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient
      .from('dashboard_snapshots')
      .upsert({
        key: 'meta',
        payload: snapshot,
        mode: snapshot?.status ?? null,
        generated_at: typeof snapshot?.generatedAt === 'string' ? snapshot.generatedAt : null
      });
    if (error) {
      console.error('[meta-agent] Supabase snapshot upsert failed:', error.message);
      await appendLog({ status: 'warning', message: `supabase upsert failed: ${error.message}` });
    } else {
      console.log('[meta-agent] Supabase dashboard snapshot updated (meta)');
    }
  } catch (error) {
    console.error('[meta-agent] Supabase snapshot upsert threw:', error instanceof Error ? error.message : error);
  }
}

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

const REQUIRED_ENV_VARS = ['META_ACCESS_TOKEN'];
for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`[meta-agent] Missing env var: ${key}`);
    process.exit(1);
  }
}

const accessToken = process.env.META_ACCESS_TOKEN.trim();
const configuredAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
const reportDays = Math.max(1, Number(process.env.META_REPORT_DAYS ?? 7));
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

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function summarizeCampaign(row) {
  const spend = Number(row.spend ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const ctr = Number(row.ctr ?? 0);
  const cpc = Number(row.cpc ?? 0);
  const cpm = Number(row.cpm ?? 0);

  const purchases = getActionValue(row.actions, 'offsite_conversion.purchase');
  const purchaseValue = getActionValue(row.action_values, 'offsite_conversion.purchase');
  const roas = purchaseValue && spend ? purchaseValue / spend : null;

  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchaseValue,
    roas
  };
}

function getActionValue(actions, target) {
  if (!Array.isArray(actions)) return null;
  const match = actions.find((action) => action?.action_type === target);
  if (!match) return null;
  const value = Number(match.value ?? match.action_value ?? match.inline_value ?? 0);
  return Number.isFinite(value) ? value : null;
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

async function fetchInsights(adAccountId) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (reportDays - 1));
  const reportingRange = Object.freeze({ startDate: iso(start), endDate: iso(end) });

  const url = buildMetaGraphUrlV1(`/act_${adAccountId}/insights`);
  url.searchParams.set(
    'fields',
    ['campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'actions', 'action_values'].join(',')
  );
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('time_range', JSON.stringify({ since: reportingRange.startDate, until: reportingRange.endDate }));
  url.searchParams.set('time_increment', `${reportDays}`);

  const result = await fetchAllMetaInsightPagesV1({
    initialUrl: url.toString(),
    accessToken,
    fetchImpl: fetch,
  });
  return { ...result, reportingRange };
}

async function main() {
  try {
    const adAccountId = await resolveAccountId();
    const { data, pagesFetched, paginationComplete, reportingRange } = await fetchInsights(adAccountId);
    const campaigns = data.map(summarizeCampaign);

    const totals = campaigns.reduce(
      (acc, campaign) => {
        acc.spend += campaign.spend ?? 0;
        acc.impressions += campaign.impressions ?? 0;
        acc.clicks += campaign.clicks ?? 0;
        acc.purchases += campaign.purchases ?? 0;
        acc.purchaseValue += campaign.purchaseValue ?? 0;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0 }
    );

    const summary = {
      ...totals,
      roas: totals.spend ? totals.purchaseValue / totals.spend : null
    };

    const generatedAt = new Date().toISOString();
    const sourceCompleteness = {
      apiVersion: META_GRAPH_API_VERSION_V1,
      paginationComplete,
      pagesFetched,
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt,
          accountId: `act_${adAccountId}`,
          range: reportDays,
          reportingRange,
          sourceCompleteness,
          campaigns,
          summary
        },
        null,
        2
      )
    );

    await upsertSupabaseSnapshot({
      generatedAt,
      accountId: `act_${adAccountId}`,
      range: reportDays,
      reportingRange,
      sourceCompleteness,
      campaigns,
      summary,
      status: summary.spend > 0 ? 'LIVE' : 'PARTIAL'
    });

    await appendLog({
      status: 'success',
      campaigns: campaigns.length,
      spend: summary.spend,
      pagesFetched,
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

#!/usr/bin/env node
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]?.trim()) throw new Error(`[website-funnel-sync] Missing env var: ${key}`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function pacificDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const anchor = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toISOString().slice(0, 10);
}

const endDate = pacificDate(-1);
const startDate = pacificDate(-14);

const { data: metrics, error: metricError } = await supabase.rpc('get_ga4_metrics', {
  start_date: startDate,
  end_date: endDate
});
if (metricError) throw new Error(`[website-funnel-sync] get_ga4_metrics failed: ${metricError.message}`);

const summary = metrics?.summary ?? {};
if (!summary.dataUsableForCurrentDecisions) {
  throw new Error(`[website-funnel-sync] GA4 data is not decision-usable: freshness=${summary.freshness} completeness=${summary.completeness}`);
}

const { data: snapshot, error: readError } = await supabase
  .from('dashboard_snapshots')
  .select('key,payload')
  .eq('key', 'website')
  .single();
if (readError) throw new Error(`[website-funnel-sync] website snapshot read failed: ${readError.message}`);

const payload = snapshot?.payload && typeof snapshot.payload === 'object' ? snapshot.payload : {};
const previousGa4 = payload.ga4 && typeof payload.ga4 === 'object' ? payload.ga4 : {};
const nextGa4 = {
  ...previousGa4,
  sessions: summary.sessions ?? null,
  eventCount: summary.eventCount ?? null,
  purchaseRevenue: summary.revenue ?? null,
  ecommercePurchases: summary.purchaseSessions ?? summary.purchases ?? null,
  addToCartEvents: summary.validatedAddToCartSessions ?? summary.validatedAddToCart ?? null,
  beginCheckoutEvents: summary.validatedBeginCheckoutSessions ?? summary.beginCheckout ?? null,
  rawAddToCartEvents: summary.rawAddToCartEvents ?? null,
  rawBeginCheckoutEvents: summary.rawBeginCheckoutEvents ?? null,
  validatedAddToCartSessions: summary.validatedAddToCartSessions ?? null,
  validatedBeginCheckoutSessions: summary.validatedBeginCheckoutSessions ?? null,
  purchaseSessions: summary.purchaseSessions ?? null,
  funnelMetricDefinitionVersion: summary.metricDefinitionVersion ?? null,
  sourceAsOf: summary.sourceAsOf ?? null,
  freshness: summary.freshness ?? null,
  completeness: summary.completeness ?? null,
  warnings: []
};

const { error: updateError } = await supabase
  .from('dashboard_snapshots')
  .update({ payload: { ...payload, ga4: nextGa4 }, updated_at: new Date().toISOString() })
  .eq('key', 'website');
if (updateError) throw new Error(`[website-funnel-sync] website snapshot update failed: ${updateError.message}`);

console.log(`[website-funnel-sync] success range=${startDate}..${endDate} ATC_sessions=${nextGa4.validatedAddToCartSessions} checkout_sessions=${nextGa4.validatedBeginCheckoutSessions} purchases=${nextGa4.purchaseSessions}`);

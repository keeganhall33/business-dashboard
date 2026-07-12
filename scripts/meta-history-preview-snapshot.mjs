#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const outPath = process.argv[2];
if (!outPath) {
  console.error('[preview-snapshot] Missing output path argument');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('[preview-snapshot] Missing Supabase env vars');
  process.exit(2);
}

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const tables = [
  { name: 'meta_ingestion_runs', order: ['run_id'] },
  { name: 'meta_account_daily', order: ['account_id', 'metric_date', 'attribution_setting'] },
  { name: 'meta_campaign_daily', order: ['account_id', 'campaign_id', 'metric_date', 'attribution_setting'] },
  { name: 'meta_adset_daily', order: ['account_id', 'adset_id', 'metric_date', 'attribution_setting'] },
  { name: 'meta_ad_daily', order: ['account_id', 'ad_id', 'metric_date', 'attribution_setting'] },
  { name: 'meta_creative_versions', order: ['creative_id', 'content_hash'] },
  { name: 'meta_ad_creative_map', order: ['ad_id', 'creative_id'] },
  { name: 'meta_creatives', order: ['creative_id'] }
];

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

async function fetchAll(table, orderBy) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = client.from(table).select('*').order(orderBy[0], { ascending: true });
    for (let i = 1; i < orderBy.length; i++) {
      query = query.order(orderBy[i], { ascending: true });
    }
    query = query.range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const snapshot = {};
for (const { name, order } of tables) {
  const rows = await fetchAll(name, order);
  const canonical = JSON.stringify(canonicalize(rows));
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  snapshot[name] = { count: rows.length, hash };
}

fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log('[preview-snapshot] Saved snapshot to', outPath);

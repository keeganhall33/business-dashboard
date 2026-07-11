#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

import { runMetaHistoryIngestion } from '../src/lib/meta-intel/ingestion.ts';

const REQUIRED_ENV = ['META_ACCESS_TOKEN'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || !process.env[key].trim()) {
    console.error(`[meta-history] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const accessToken = process.env.META_ACCESS_TOKEN.trim();
const configuredAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
const since = process.env.META_HISTORY_SINCE?.trim();
const until = process.env.META_HISTORY_UNTIL?.trim();
const maxPages = parseIntegerEnv('META_HISTORY_MAX_PAGES');
const maxRetries = parseIntegerEnv('META_HISTORY_MAX_RETRIES');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseClient = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

if (!supabaseClient) {
  console.warn('[meta-history] Supabase credentials missing; run will be local-only');
}

const repoRoot = process.cwd();
const sourceCommit = resolveCommitSha();
const outputPath = path.join(repoRoot, 'dashboard', 'data', 'meta-history', 'validation-latest.json');

async function main() {
  try {
    const summary = await runMetaHistoryIngestion({
      accessToken,
      configuredAccountId,
      since,
      until,
      maxPages,
      maxRetries,
      supabaseClient,
      sourceCommit
    });

    await writeValidationArtifact(summary, outputPath);
    console.log(
      `[meta-history] Run ${summary.runId} status=${summary.status} rows=${JSON.stringify(summary.rowCounts)} warnings=${summary.warnings.length}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[meta-history] Failed: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

await main();

async function writeValidationArtifact(summary, targetPath) {
  const artifact = {
    generatedAt: new Date().toISOString(),
    runId: summary.runId,
    status: summary.status,
    account: {
      id: summary.account.accountId,
      timezone: summary.account.timezoneName,
      currency: summary.account.currency
    },
    range: summary.range,
    rowCounts: summary.rowCounts,
    warnings: summary.warnings,
    payloadHash: summary.payloadHash,
    usage: summary.usage
  };
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(artifact, null, 2));
}

function parseIntegerEnv(key) {
  const raw = process.env[key];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function resolveCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

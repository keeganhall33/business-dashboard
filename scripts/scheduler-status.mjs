#!/usr/bin/env node
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    `[scheduler-status] Missing Supabase env vars (urlPresent=${Boolean(supabaseUrl)} keyPresent=${Boolean(
      supabaseServiceRoleKey
    )}). Aborting.`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function isOverdue(job) {
  if (!job?.next_run_at) return false;
  const nextRun = new Date(job.next_run_at).getTime();
  if (!Number.isFinite(nextRun)) return false;
  const bufferMs = 5 * 60 * 1000;
  return nextRun + bufferMs < Date.now();
}

async function main() {
  console.log('[scheduler-status] Supabase URL length:', supabaseUrl.length);

  const { data: jobs, error: jobsError } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .order('job_key', { ascending: true });
  if (jobsError) {
    console.error('[scheduler-status] Failed to load scheduled_jobs:', jobsError.message);
    process.exit(1);
  }

  const jobKeys = (jobs ?? []).map((job) => job.job_key);
  console.log('[scheduler-status] job count:', jobKeys.length);

  let latestRunByJob = new Map();
  if (jobKeys.length) {
    const { data: runs, error: runsError } = await supabase
      .from('job_run_log')
      .select('*')
      .in('job_key', jobKeys)
      .order('started_at', { ascending: false });
    if (runsError) {
      console.error('[scheduler-status] Failed to load job_run_log:', runsError.message);
      process.exit(1);
    }
    for (const run of runs ?? []) {
      if (!latestRunByJob.has(run.job_key)) {
        latestRunByJob.set(run.job_key, run);
      }
    }
  }

  const failingCount = jobKeys.filter((jobKey) => latestRunByJob.get(jobKey)?.status === 'failed').length;
  const missingTelemetryCount = jobKeys.filter((jobKey) => !latestRunByJob.has(jobKey)).length;
  const overdueCount = jobs.filter((job) => isOverdue(job)).length;

  const { data: schedulerControl } = await supabase
    .from('system_state')
    .select('value_json')
    .eq('key', 'scheduler_control')
    .single();
  const cronEnabled = Boolean(schedulerControl?.value_json?.cronEnabled ?? false);

  const status = jobKeys.length === 0 ? 'BROKEN' : cronEnabled && failingCount === 0 && missingTelemetryCount === 0 ? 'LIVE' : 'PARTIAL';
  const summary = {
    status,
    cronEnabled,
    jobCount: jobKeys.length,
    failingCount,
    missingTelemetryCount,
    overdueCount,
    lastUpdatedAt: new Date().toISOString(),
    source: 'scheduler-status-script'
  };

  console.log('[scheduler-status] summary:', summary);

  const { error: upsertError } = await supabase
    .from('system_state')
    .upsert({ key: 'scheduler_status', value_json: summary }, { onConflict: 'key' });
  if (upsertError) {
    console.error('[scheduler-status] Failed to upsert scheduler_status:', upsertError.message);
    process.exit(1);
  }
  console.log('[scheduler-status] scheduler_status row updated.');
}

main().catch((error) => {
  console.error('[scheduler-status] Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});

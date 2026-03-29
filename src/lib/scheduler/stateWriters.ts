import { upsertSystemState } from "@/lib/supabase/queries";

export async function writeLatestDirectiveState(input: {
  directive: string;
  source: string;
  generatedAt?: string;
}) {
  await upsertSystemState("latest_directive", {
    directive: input.directive,
    source: input.source,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  });
}

export async function writeWeeklySummaryState(summary: Record<string, unknown>) {
  await upsertSystemState("weekly_summary", {
    ...summary,
    updatedAt: new Date().toISOString()
  });
}

export async function writeDashboardSnapshotMeta(input: {
  source: string;
  mode?: string;
  lastRefreshedAt?: string;
}) {
  await upsertSystemState("dashboard_snapshot_meta", {
    source: input.source,
    mode: input.mode ?? null,
    lastRefreshedAt: input.lastRefreshedAt ?? new Date().toISOString()
  });
}

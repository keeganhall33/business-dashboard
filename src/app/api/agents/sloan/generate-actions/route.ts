import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { ensurePreparedActionsFromSloanSignals } from "@/lib/prepared-actions/from-sloan";
import { getDashboardSnapshots, getPreparedActionsForDashboard, getScoreboardMetricsForRange, type DashboardSnapshotRecord } from "@/lib/supabase/queries";
import type { MarketingCommandSnapshot, PreparedAction, WebsiteConversionSnapshot } from "@/lib/types/dashboard";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    const range = { startDate: formatDate(start), endDate: formatDate(end) };

    const [metrics, snapshotRows, initialActions] = await Promise.all([
      getScoreboardMetricsForRange(range),
      getDashboardSnapshots(["website", "marketing_command"] as unknown as string[]),
      getPreparedActionsForDashboard()
    ]);

    const rows = snapshotRows as DashboardSnapshotRecord[];
    const websiteSnapshot = rows.find((row) => row.key === "website")?.payload as WebsiteConversionSnapshot | null;
    const marketingSnapshot = rows.find((row) => row.key === "marketing_command")?.payload as MarketingCommandSnapshot | null;

    const preparedActions = initialActions as PreparedAction[];
    const sloanSummary = await ensurePreparedActionsFromSloanSignals({
      metrics,
      websiteSnapshot,
      marketingSnapshot,
      preparedActions
    });

    return ok({
      ok: true,
      actions_created: sloanSummary.actionsCreated,
      actions_skipped_duplicate: sloanSummary.actionsSkippedDuplicate,
      actions_skipped_low_confidence: sloanSummary.actionsSkippedLowConfidence,
      evidence_source: {
        scoreboard_range: range,
        website_snapshot: websiteSnapshot?.generatedAt ?? null,
        marketing_snapshot: marketingSnapshot?.generatedAt ?? null
      },
      signals_checked: sloanSummary.signalsChecked
    });
  } catch (error) {
    console.error("sloan generate error", error);
    return serverError("Failed to generate Sloan prepared actions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

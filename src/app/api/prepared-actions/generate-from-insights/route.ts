import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getDashboardSnapshots, getPreparedActionsForDashboard, type DashboardSnapshotRecord } from "@/lib/supabase/queries";
import { ensurePreparedActionsFromMarketingSnapshot } from "@/lib/prepared-actions/from-marketing";
import { ensurePreparedActionsFromMetaSnapshot } from "@/lib/prepared-actions/from-meta";
import { ensurePreparedActionsFromContentIdeas } from "@/lib/prepared-actions/from-content";
import { buildContentIdeas } from "@/lib/dashboard/content-ideas";
import type { MarketingCommandSnapshot, MetaAdsSnapshot, PreparedAction } from "@/lib/types/dashboard";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const [snapshotRows, initialActions] = await Promise.all([
      getDashboardSnapshots(["marketing_command", "meta"] as unknown as string[]),
      getPreparedActionsForDashboard()
    ]);

    const rows = snapshotRows as DashboardSnapshotRecord[];
    const marketingSnapshot = rows.find((row) => row.key === "marketing_command")?.payload as MarketingCommandSnapshot | null;
    const metaSnapshot = rows.find((row) => row.key === "meta")?.payload as MetaAdsSnapshot | null;

    let preparedActions = initialActions as PreparedAction[];
    const summary = { actions_created: 0, actions_skipped_duplicate: 0, actions_skipped_unsupported: 0 };

    async function refreshActionsIfNeeded(created: number) {
      if (created > 0) {
        preparedActions = await getPreparedActionsForDashboard();
      }
    }

    if (marketingSnapshot) {
      const marketingSummary = await ensurePreparedActionsFromMarketingSnapshot(marketingSnapshot, preparedActions);
      summary.actions_created += marketingSummary.created;
      summary.actions_skipped_duplicate += marketingSummary.skippedDuplicate;
      summary.actions_skipped_unsupported += marketingSummary.skippedUnsupported;
      await refreshActionsIfNeeded(marketingSummary.created);

      const contentSummary = await ensurePreparedActionsFromContentIdeas(
        buildContentIdeas(marketingSnapshot),
        marketingSnapshot,
        preparedActions
      );
      summary.actions_created += contentSummary.created;
      summary.actions_skipped_duplicate += contentSummary.skippedDuplicate;
      summary.actions_skipped_unsupported += contentSummary.skippedUnsupported;
      await refreshActionsIfNeeded(contentSummary.created);
    }

    if (metaSnapshot) {
      const metaSummary = await ensurePreparedActionsFromMetaSnapshot(metaSnapshot, preparedActions);
      summary.actions_created += metaSummary.created;
      summary.actions_skipped_duplicate += metaSummary.skippedDuplicate;
      summary.actions_skipped_unsupported += metaSummary.skippedUnsupported;
      await refreshActionsIfNeeded(metaSummary.created);
    }

    return ok({
      ok: true,
      ...summary,
      evidence_source: {
        marketing: marketingSnapshot?.generatedAt ?? null,
        meta: metaSnapshot?.generatedAt ?? null
      },
      message:
        !marketingSnapshot && !metaSnapshot
          ? "No snapshots available. Run marketing:run or meta:run first."
          : undefined
    });
  } catch (error) {
    console.error("generate-from-insights error", error);
    return serverError("Failed to generate prepared actions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

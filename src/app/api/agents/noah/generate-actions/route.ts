import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getDashboardSnapshots, getPreparedActionsForDashboard, type DashboardSnapshotRecord } from "@/lib/supabase/queries";
import type { PartnershipOpportunitySnapshot, PreparedAction } from "@/lib/types/dashboard";
import { ensurePreparedActionFromPartnershipSnapshot } from "@/lib/prepared-actions/from-partnership";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const [snapshots, existing] = await Promise.all([
      getDashboardSnapshots(["partnership_feed"] as unknown as string[]),
      getPreparedActionsForDashboard()
    ]);

    const rows = snapshots as DashboardSnapshotRecord[];
    const partnershipSnapshot = rows.find((row) => row.key === "partnership_feed")?.payload as PartnershipOpportunitySnapshot | null;

    const summary = await ensurePreparedActionFromPartnershipSnapshot(partnershipSnapshot ?? null, existing as PreparedAction[]);

    return ok({
      ok: true,
      actions_created: summary.created,
      actions_skipped_duplicate: summary.skippedDuplicate,
      evidence_source: { partnership_feed: partnershipSnapshot?.generatedAt ?? null },
      message: summary.message
    });
  } catch (error) {
    console.error("noah generate-actions error", error);
    return serverError("Failed to stage Noah prepared action", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

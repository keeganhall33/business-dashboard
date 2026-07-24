import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getDashboardSnapshots, getPreparedActionsForDashboard, type DashboardSnapshotRecord } from "@/lib/supabase/queries";
import type { PreparedAction, SocialContentSnapshot } from "@/lib/types/dashboard";
import { ensurePreparedActionFromSocialSnapshot } from "@/lib/prepared-actions/from-social-content";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const [snapshots, existing] = await Promise.all([
      getDashboardSnapshots(["social_content"] as unknown as string[]),
      getPreparedActionsForDashboard()
    ]);

    const rows = snapshots as DashboardSnapshotRecord[];
    const socialSnapshot = rows.find((row) => row.key === "social_content")?.payload as SocialContentSnapshot | null;

    const summary = await ensurePreparedActionFromSocialSnapshot(socialSnapshot ?? null, existing as PreparedAction[]);

    return ok({
      ok: true,
      actions_created: summary.created,
      actions_skipped_duplicate: summary.skippedDuplicate,
      evidence_source: { social_content: socialSnapshot?.generatedAt ?? null },
      message: summary.message
    });
  } catch (error) {
    console.error("lyra generate-actions error", error);
    return serverError("Failed to stage Lyra prepared action", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

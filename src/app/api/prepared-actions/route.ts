import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import {
  createPreparedActionSchema,
  preparedActionsQuerySchema,
  parseCategoryList,
  parseStatusList
} from "@/lib/validation/prepared-actions";
import { createPreparedAction, getPreparedActions } from "@/lib/supabase/queries";
import type { PreparedActionCategory, PreparedActionStatus } from "@/lib/types/dashboard";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, preparedActionsQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const statuses = parseStatusList(parsed.data.status) as PreparedActionStatus[] | undefined;
    const categories = parseCategoryList(parsed.data.category) as PreparedActionCategory[] | undefined;
    const riskLevel = parsed.data.riskLevel ?? undefined;
    const sourcePanel = parsed.data.sourcePanel ?? undefined;

    const items = await getPreparedActions({ statuses, categories, riskLevel, sourcePanel, limit: 200 });
    return ok({ ok: true, items });
  } catch (error) {
    return serverError("Failed to load prepared actions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createPreparedActionSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const action = await createPreparedAction({
      title: parsed.data.title,
      category: parsed.data.category,
      sourcePanel: parsed.data.sourcePanel,
      sourceInsightId: parsed.data.sourceInsightId ?? null,
      sourceSnapshotAt: parsed.data.sourceSnapshotAt ?? null,
      sourceUrl: parsed.data.sourceUrl ?? null,
      dedupeKey: parsed.data.dedupeKey ?? null,
      whyItMatters: parsed.data.whyItMatters,
      evidence: parsed.data.evidence,
      preparedAsset: parsed.data.preparedAsset ?? [],
      estimatedImpact: parsed.data.estimatedImpact ?? null,
      riskLevel: parsed.data.riskLevel ?? undefined,
      confidence: parsed.data.confidence ?? undefined,
      dataLight: parsed.data.dataLight ?? false,
      requiredApprovalAction: parsed.data.requiredApprovalAction,
      createdByAgent: parsed.data.createdByAgent,
      expiresAt: parsed.data.expiresAt ?? null,
      notes: parsed.data.notes ?? null
    });

    return ok({ ok: true, action });
  } catch (error) {
    const isDedupeViolation = (() => {
      if (!error || typeof error !== "object") return false;
      const pg = error as { code?: string; message?: string | null; details?: string | null; hint?: string | null };
      if (pg.code === "23505") {
        const blob = `${pg.message ?? ""} ${pg.details ?? ""} ${pg.hint ?? ""}`.toLowerCase();
        return blob.includes("prepared_actions_dedupe_active_idx");
      }
      const message = pg.message ?? "";
      return message.includes("prepared_actions_dedupe_active_idx");
    })();

    if (isDedupeViolation) {
      return validationError("Prepared action already exists for this insight", [
        { path: "dedupeKey", message: "Prepared action already exists for this insight." }
      ]);
    }

    const message = error instanceof Error ? error.message : String(error);
    return serverError("Failed to create prepared action", { message });
  }
}

import { notFound, ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/validation/parse";
import { updatePreparedActionSchema } from "@/lib/validation/prepared-actions";
import { getPreparedActionById, updatePreparedAction } from "@/lib/supabase/queries";

const STATUS_TRANSITIONS: Record<string, Array<"ready_for_review" | "approved" | "rejected" | "manually_executed" | "archived">> = {
  draft: ["ready_for_review", "archived"],
  ready_for_review: ["approved", "rejected", "archived"],
  approved: ["manually_executed", "archived"],
  rejected: ["archived"],
  manually_executed: ["archived"],
  archived: []
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const parsed = await parseJsonBody(request, updatePreparedActionSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const { id } = await context.params;

    const existing = await getPreparedActionById(id);
    if (!existing) return notFound("Prepared action not found");

    const allowed = STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return validationError("Invalid status transition", [
        { path: "status", message: `Cannot move ${existing.status} → ${parsed.data.status}` }
      ]);
    }

    if (parsed.data.status === "rejected" && !parsed.data.rejectionReason?.trim()) {
      return validationError("Rejection reason required", [{ path: "rejectionReason", message: "Required" }]);
    }

    if (parsed.data.status === "manually_executed" && !parsed.data.manualExecutionNote?.trim()) {
      return validationError("Manual execution note required", [{ path: "manualExecutionNote", message: "Required" }]);
    }

    const nowIso = new Date().toISOString();
    const updatePayload: {
      status: typeof parsed.data.status;
      approvalNote?: string | null;
      rejectionReason?: string | null;
      manualExecutionNote?: string | null;
      approvedAt?: string | null;
      rejectedAt?: string | null;
      manuallyExecutedAt?: string | null;
      archivedAt?: string | null;
      notes?: string | null;
    } = {
      status: parsed.data.status,
      notes: parsed.data.notes ?? undefined
    };

    switch (parsed.data.status) {
      case "ready_for_review":
        break;
      case "approved":
        updatePayload.approvedAt = nowIso;
        updatePayload.approvalNote = parsed.data.approvalNote ?? null;
        updatePayload.rejectedAt = null;
        updatePayload.manuallyExecutedAt = null;
        break;
      case "rejected":
        updatePayload.rejectedAt = nowIso;
        updatePayload.rejectionReason = parsed.data.rejectionReason ?? null;
        updatePayload.approvedAt = null;
        updatePayload.manuallyExecutedAt = null;
        break;
      case "manually_executed":
        updatePayload.manuallyExecutedAt = nowIso;
        updatePayload.manualExecutionNote = parsed.data.manualExecutionNote ?? null;
        break;
      case "archived":
        updatePayload.archivedAt = nowIso;
        break;
      default:
        break;
    }

    const updated = await updatePreparedAction(id, updatePayload);
    if (!updated) return serverError("Failed to update prepared action");

    return ok({ ok: true, action: updated });
  } catch (error) {
    return serverError("Failed to update prepared action", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

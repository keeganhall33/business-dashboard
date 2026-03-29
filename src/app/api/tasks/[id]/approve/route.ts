import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateTaskApproval } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { approveTaskSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, approveTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const task = await updateTaskApproval(id, parsed.data.approvedByUser);
    return ok({ ok: true, task });
  } catch (error) {
    return serverError("Failed to approve task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

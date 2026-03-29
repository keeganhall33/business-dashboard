import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateTaskStatus } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { updateTaskStatusSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, updateTaskStatusSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const task = await updateTaskStatus(id, parsed.data.status);
    return ok({ ok: true, task });
  } catch (error) {
    return serverError("Failed to update task status", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

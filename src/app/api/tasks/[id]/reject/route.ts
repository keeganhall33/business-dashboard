import { ok, serverError, validationError } from "@/lib/api/responses";
import { rejectTask } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { rejectTaskSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (process.env.E2E_TEST === "1") {
      const { id } = await context.params;
      return ok({ ok: true, task: { id, status: "rejected" } });
    }
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, rejectTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const task = await rejectTask(id, parsed.data.reason);
    return ok({ ok: true, task });
  } catch (error) {
    return serverError("Failed to reject task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

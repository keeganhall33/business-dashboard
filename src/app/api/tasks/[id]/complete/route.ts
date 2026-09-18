import { ok, serverError, validationError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { completeTask } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { completeTaskSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, completeTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const task = await completeTask(id, parsed.data.resultSummary, parsed.data.attachments);
    return ok({ ok: true, task });
  } catch (error) {
    return serverError("Failed to complete task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateIdeaStatus } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { updateIdeaStatusSchema } from "@/lib/validation/ideas";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, updateIdeaStatusSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const idea = await updateIdeaStatus({ id, status: parsed.data.status, approver: parsed.data.approver ?? null });
    return ok({ ok: true, idea });
  } catch (error) {
    return serverError("Failed to update idea", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


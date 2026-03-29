import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateOpportunityStatus } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { updateOpportunityStatusSchema } from "@/lib/validation/opportunities";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, updateOpportunityStatusSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const opportunity = await updateOpportunityStatus(id, parsed.data.status);
    return ok({ ok: true, opportunity });
  } catch (error) {
    return serverError("Failed to update opportunity status", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

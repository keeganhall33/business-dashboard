import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateOpportunityStatus } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { updateOpportunityStatusSchema } from "@/lib/validation/opportunities";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) return validationError("Missing opportunity id", []);

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


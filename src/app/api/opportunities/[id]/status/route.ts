import { ok, serverError, validationError } from "@/lib/api/responses";
import { getOpportunityById, updateOpportunityStatus } from "@/lib/supabase/queries";
import { explainOpportunityTransition, isOpportunityForwardTransition } from "@/lib/opportunity-approval-pipeline";
import { parseJsonBody } from "@/lib/validation/parse";
import { opportunityStatusSchema } from "@/lib/validation/common";
import { updateOpportunityStatusSchema } from "@/lib/validation/opportunities";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!id) return validationError("Missing opportunity id", []);

    const parsed = await parseJsonBody(request, updateOpportunityStatusSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const current = await getOpportunityById(id);
    const fromStatus = (current as { status?: unknown }).status;
    const toStatus = parsed.data.status;

    const parsedFrom = opportunityStatusSchema.safeParse(fromStatus);
    if (parsedFrom.success) {
      const normalizedFrom = parsedFrom.data;
      if (!isOpportunityForwardTransition(normalizedFrom, toStatus)) {
        return validationError(explainOpportunityTransition(normalizedFrom, toStatus), []);
      }
    }

    const opportunity = await updateOpportunityStatus(id, parsed.data.status);
    return ok({ ok: true, opportunity });
  } catch (error) {
    return serverError("Failed to update opportunity status", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

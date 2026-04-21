import { ok, serverError, validationError } from "@/lib/api/responses";
import { updateCeoQuestion } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { patchCeoQuestionSchema } from "@/lib/validation/ceoQuestions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, patchCeoQuestionSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const question = await updateCeoQuestion({
      id,
      status: parsed.data.status,
      escalationLevel: parsed.data.escalationLevel,
      priority: parsed.data.priority,
      ownerAgent: parsed.data.ownerAgent ?? undefined,
      dueAt: parsed.data.dueAt ?? undefined,
      markAnswered: parsed.data.markAnswered,
      answeredBy: parsed.data.answeredBy ?? null,
      escalatedBy: parsed.data.escalatedBy ?? null
    });

    return ok({ ok: true, question });
  } catch (error) {
    return serverError("Failed to update CEO question", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


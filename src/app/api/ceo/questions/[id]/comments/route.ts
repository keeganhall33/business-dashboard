import { ok, serverError, validationError } from "@/lib/api/responses";
import { createCeoQuestionComment } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { createCeoQuestionCommentSchema } from "@/lib/validation/ceoQuestions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, createCeoQuestionCommentSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const comment = await createCeoQuestionComment({
      questionId: id,
      commenter: parsed.data.commenter,
      body: parsed.data.body
    });

    return ok({ ok: true, comment });
  } catch (error) {
    return serverError("Failed to add CEO question comment", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


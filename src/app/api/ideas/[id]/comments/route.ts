import { ok, serverError, validationError } from "@/lib/api/responses";
import { createIdeaComment } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { createIdeaCommentSchema } from "@/lib/validation/ideas";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, createIdeaCommentSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const comment = await createIdeaComment({
      ideaId: id,
      commenter: parsed.data.commenter,
      comment: parsed.data.comment
    });

    return ok({ ok: true, comment });
  } catch (error) {
    return serverError("Failed to add idea comment", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


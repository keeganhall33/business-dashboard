import { ok, serverError, validationError } from "@/lib/api/responses";
import { createCeoQuestion, getCeoQuestions } from "@/lib/supabase/queries";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { ceoQuestionsQuerySchema, createCeoQuestionSchema } from "@/lib/validation/ceoQuestions";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, ceoQuestionsQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const result = await getCeoQuestions(parsed.data);
    return ok({ ok: true, items: result.items, count: result.count });
  } catch (error) {
    return serverError("Failed to fetch CEO questions", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createCeoQuestionSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const question = await createCeoQuestion({
      askedBy: parsed.data.askedBy,
      escalationLevel: parsed.data.escalationLevel,
      question: parsed.data.question,
      context: parsed.data.context,
      status: parsed.data.status,
      priority: parsed.data.priority,
      ownerAgent: parsed.data.ownerAgent,
      dueAt: parsed.data.dueAt
    });

    return ok({ ok: true, question });
  } catch (error) {
    return serverError("Failed to create CEO question", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


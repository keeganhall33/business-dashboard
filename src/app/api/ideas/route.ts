import { ok, serverError, validationError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { createIdea, getIdeas } from "@/lib/supabase/queries";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { createIdeaSchema, ideasQuerySchema } from "@/lib/validation/ideas";

export async function GET(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, ideasQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const result = await getIdeas(parsed.data);
    return ok({ ok: true, items: result.items, count: result.count });
  } catch (error) {
    return serverError("Failed to fetch ideas", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const parsed = await parseJsonBody(request, createIdeaSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const idea = await createIdea(parsed.data);
    return ok({ ok: true, idea });
  } catch (error) {
    return serverError("Failed to create idea", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

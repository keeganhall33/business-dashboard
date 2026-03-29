import { ok, serverError, validationError } from "@/lib/api/responses";
import { createOpportunity, getOpportunities } from "@/lib/supabase/queries";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { createOpportunitySchema, opportunitiesQuerySchema } from "@/lib/validation/opportunities";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, opportunitiesQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const result = await getOpportunities(parsed.data);
    return ok({ ok: true, items: result.items, count: result.count });
  } catch (error) {
    return serverError("Failed to fetch opportunities", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createOpportunitySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const opportunity = await createOpportunity(parsed.data);
    return ok({ ok: true, opportunity });
  } catch (error) {
    return serverError("Failed to create opportunity", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

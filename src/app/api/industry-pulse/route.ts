import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseSearchParams } from "@/lib/validation/parse";
import { industryPulseQuerySchema } from "@/lib/validation/industryPulse";
import { getIndustryPulseSnapshot } from "@/lib/supabase/industryPulse";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, industryPulseQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const { snapshot, availableDays } = await getIndustryPulseSnapshot({
      day: parsed.data.day,
      days: parsed.data.days,
      limit: parsed.data.limit
    });

    return ok({
      ok: true,
      day: snapshot.day,
      refreshedAtIso: snapshot.refreshedAtIso,
      items: snapshot.items,
      availableDays
    });
  } catch (error) {
    return serverError("Failed to fetch industry pulse", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


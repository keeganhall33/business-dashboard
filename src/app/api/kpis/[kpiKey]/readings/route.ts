import { ok, serverError, validationError } from "@/lib/api/responses";
import { createAgentKpiReading } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { createKpiReadingSchema } from "@/lib/validation/kpis";

export async function POST(request: Request, context: { params: Promise<{ kpiKey: string }> }) {
  try {
    const { kpiKey } = await context.params;
    const parsed = await parseJsonBody(request, createKpiReadingSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const reading = await createAgentKpiReading({
      kpiKey,
      value: parsed.data.value ?? null,
      measuredAtIso: parsed.data.measuredAt,
      source: parsed.data.source,
      notes: parsed.data.notes
    });

    return ok({ ok: true, reading });
  } catch (error) {
    return serverError("Failed to create KPI reading", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, validationError } from "@/lib/api/responses";
import { createScoreboardMetricReading } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { createMetricReadingSchema } from "@/lib/validation/metrics";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createMetricReadingSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    // E2E test harness: allow Playwright to save manual readings without Supabase.
    if (process.env.E2E_TEST === "1") {
      return ok({
        ok: true,
        reading: {
          id: `reading-e2e-${parsed.data.metricKey}-${Date.now()}`,
          metricKey: parsed.data.metricKey,
          currentValue: parsed.data.currentValue,
          measuredAtIso: parsed.data.measuredAt ?? new Date().toISOString(),
          source: parsed.data.source ?? "manual"
        }
      });
    }

    const reading = await createScoreboardMetricReading({
      metricKey: parsed.data.metricKey,
      currentValue: parsed.data.currentValue,
      measuredAtIso: parsed.data.measuredAt,
      source: parsed.data.source ?? "manual"
    });

    return ok({ ok: true, reading });
  } catch (error) {
    return serverError("Failed to create metric reading", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

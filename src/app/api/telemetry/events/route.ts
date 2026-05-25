import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/validation/parse";
import { z } from "zod";

const telemetryEventSchema = z.object({
  name: z.string().min(1),
  ts: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, telemetryEventSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    // For now: server-side audit hook. Swap to DB sink once table exists.
    // Avoid dumping full objects; keep it compact.
    const { name, ts, properties } = parsed.data;
    console.info("[business-dashboard.telemetry]", { name, ts, properties });

    return ok({ ok: true });
  } catch (error) {
    return serverError("Failed to record telemetry event", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

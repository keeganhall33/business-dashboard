import { ok, serverError, validationError } from "@/lib/api/responses";
import { createCollectorRelationship } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { z } from "zod";

const collectorSchema = z.object({
  collectorName: z.string().min(2),
  tier: z.enum(["A", "B"]),
  relationshipStatus: z.string().optional(),
  lastOutreachAt: z.string().datetime().nullable().optional(),
  nextMove: z.string().optional(),
  nextMoveDueAt: z.string().datetime().nullable().optional(),
  estimatedValue: z.number().finite().nullable().optional(),
  priority: z.number().int().optional()
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, collectorSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const collector = await createCollectorRelationship(parsed.data);
    return ok({ ok: true, collector });
  } catch (error) {
    return serverError("Failed to create collector", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

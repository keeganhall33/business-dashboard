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

    // E2E test harness: allow Playwright to create collectors without Supabase.
    if (process.env.E2E_TEST === "1") {
      const now = new Date().toISOString();
      return ok({
        ok: true,
        collector: {
          id: `collector-e2e-${Date.now()}`,
          name: parsed.data.collectorName,
          tier: parsed.data.tier,
          status: parsed.data.relationshipStatus ?? null,
          lastOutreachAt: parsed.data.lastOutreachAt ?? now,
          nextMove: parsed.data.nextMove ?? null,
          nextMoveDueAt: parsed.data.nextMoveDueAt ?? null,
          estimatedValue: parsed.data.estimatedValue ?? null,
          supportingDocs: []
        }
      });
    }

    const collector = await createCollectorRelationship(parsed.data);
    return ok({ ok: true, collector });
  } catch (error) {
    return serverError("Failed to create collector", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

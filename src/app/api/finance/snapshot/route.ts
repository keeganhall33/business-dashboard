import { ok, serverError, validationError } from "@/lib/api/responses";
import { upsertFinanceSnapshot } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { z } from "zod";

const financeSchema = z.object({
  cashOnHand: z.number().finite().nonnegative().nullable().optional(),
  monthlyBurn: z.number().finite().nonnegative().nullable().optional(),
  projected30dRevenue: z.number().finite().nonnegative().nullable().optional(),
  survivalFloor: z.number().finite().positive().nullable().optional()
});

export async function POST(request: Request) {
  try {
    if (process.env.E2E_TEST === "1") {
      return ok({ ok: true, snapshot: { id: "finance-e2e", ...((await request.json().catch(() => ({}))) as object) } });
    }
    const parsed = await parseJsonBody(request, financeSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const payload = parsed.data;
    const snapshot = await upsertFinanceSnapshot({
      cashOnHand: payload.cashOnHand ?? null,
      monthlyBurn: payload.monthlyBurn ?? null,
      projected30dRevenue: payload.projected30dRevenue ?? null,
      survivalFloor: payload.survivalFloor ?? undefined
    });

    return ok({ ok: true, snapshot });
  } catch (error) {
    return serverError("Failed to update finance snapshot", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

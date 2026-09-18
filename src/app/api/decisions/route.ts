import { ok, serverError, validationError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { createDecision } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { createDecisionSchema } from "@/lib/validation/decisions";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const parsed = await parseJsonBody(request, createDecisionSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const decision = await createDecision(parsed.data);
    return ok({ ok: true, decision });
  } catch (error) {
    return serverError("Failed to create decision", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

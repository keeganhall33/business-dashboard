import { ok, badRequest, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const bodyUnknown: unknown = await request.json().catch(() => ({}));
    const body = (bodyUnknown && typeof bodyUnknown === "object") ? (bodyUnknown as Record<string, unknown>) : {};

    const fingerprint = String(body["fingerprint"] ?? "").trim();
    if (!fingerprint) return badRequest("fingerprint required");

    const suppressed = Boolean(body["suppressed"]);
    const reason = String(body["reason"] ?? "").trim();
    const idempotencyKey = String(request.headers.get("x-idempotency-key") ?? "").trim();
    if (!idempotencyKey) return badRequest("Missing x-idempotency-key");

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("action_preferences_v1")
      .upsert({ fingerprint, suppressed, suppress_reason: reason || null })
      .eq("fingerprint", fingerprint);
    if (error) throw error;

    return ok({ ok: true });
  } catch (error) {
    return serverError("Failed to update preference", { message: error instanceof Error ? error.message : String(error) });
  }
}

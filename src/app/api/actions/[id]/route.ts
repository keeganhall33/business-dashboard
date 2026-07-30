import { ok, notFound, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { getAction } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const action = await getAction(id);
    if (!action) return notFound("Action not found");
    return ok({ ok: true, action });
  } catch (error) {
    return serverError("Failed to load action", { message: error instanceof Error ? error.message : String(error) });
  }
}


import { ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { listAuditEvents } from "@/lib/actions/action-store";

export const runtime = "nodejs";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await ctx.params;
    const audit = await listAuditEvents(id);
    return ok({ ok: true, audit });
  } catch (error) {
    return serverError("Failed to load audit", { message: error instanceof Error ? error.message : String(error) });
  }
}

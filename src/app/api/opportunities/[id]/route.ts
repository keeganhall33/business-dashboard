import { notFound, ok, serverError } from "@/lib/api/responses";
import { getOpportunityById } from "@/lib/supabase/queries";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const opportunity = await getOpportunityById(id).catch(() => null);
    if (!opportunity) return notFound(`Opportunity not found: ${id}`);

    return ok({ ok: true, opportunity });
  } catch (error) {
    return serverError("Failed to fetch opportunity", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

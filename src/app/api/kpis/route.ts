import { ok, serverError, validationError } from "@/lib/api/responses";
import { listAgentKpis, upsertAgentKpiDefinition } from "@/lib/supabase/queries";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { listKpisQuerySchema, upsertKpiSchema } from "@/lib/validation/kpis";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, listKpisQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const items = await listAgentKpis({ agentKey: parsed.data.agentKey ?? undefined });
    return ok({ ok: true, items, count: items.length });
  } catch (error) {
    return serverError("Failed to fetch KPIs", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, upsertKpiSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const kpi = await upsertAgentKpiDefinition({
      kpiKey: parsed.data.kpiKey,
      agentKey: parsed.data.agentKey,
      kpiName: parsed.data.kpiName,
      description: parsed.data.description ?? null,
      targetValue: typeof parsed.data.targetValue === "number" ? parsed.data.targetValue : null,
      unit: parsed.data.unit ?? null,
      frequency: parsed.data.frequency ?? null,
      priority: parsed.data.priority ?? null
    });

    return ok({ ok: true, kpi });
  } catch (error) {
    return serverError("Failed to upsert KPI", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

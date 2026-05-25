import { ok, serverError, validationError } from "@/lib/api/responses";
import { listAgentKpis, upsertAgentKpiDefinition } from "@/lib/supabase/queries";
import { AgentKpiDefinition } from "@/lib/types/dashboard";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { listKpisQuerySchema, upsertKpiSchema } from "@/lib/validation/kpis";

// Minimal in-memory store for the E2E harness (no Supabase).
// Note: serverless runtimes may not persist this between requests; Playwright only
// needs a single-process happy path.
type E2EKpiDefinition = AgentKpiDefinition & { agentKey?: string };

let e2eKpis: E2EKpiDefinition[] = [
  {
    kpiKey: "kpi-e2e-mrr",
    agentKey: "avery",
    kpiName: "MRR",
    description: "E2E fixture",
    targetValue: 50000,
    unit: "USD",
    frequency: "weekly",
    priority: "high",
    latestReading: {
      id: "kpi-reading-e2e-1",
      value: 42000,
      measuredAt: new Date().toISOString(),
      source: "e2e",
      notes: null
    },
    priorReading: null
  }
];

export async function GET(request: Request) {
  try {
    if (process.env.E2E_TEST === "1") {
      return ok({ ok: true, items: e2eKpis, count: e2eKpis.length });
    }

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
    if (process.env.E2E_TEST === "1") {
      const parsed = await parseJsonBody(request, upsertKpiSchema);
      if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

      const kpi = {
        kpiKey: parsed.data.kpiKey,
        agentKey: parsed.data.agentKey,
        kpiName: parsed.data.kpiName,
        description: parsed.data.description ?? null,
        targetValue: typeof parsed.data.targetValue === "number" ? parsed.data.targetValue : null,
        unit: parsed.data.unit ?? null,
        frequency: parsed.data.frequency ?? null,
        priority: parsed.data.priority ?? null,
        latestReading: null,
        priorReading: null
      };

      e2eKpis = [kpi, ...e2eKpis.filter((item) => item.kpiKey !== kpi.kpiKey)];
      return ok({ ok: true, kpi });
    }

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

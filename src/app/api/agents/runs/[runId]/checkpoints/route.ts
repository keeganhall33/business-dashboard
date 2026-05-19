import { ok, serverError, validationError } from "@/lib/api/responses";
import { listSystemRunCheckpoints, upsertSystemRunCheckpoint } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { upsertCheckpointSchema } from "@/lib/validation/checkpoints";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const items = await listSystemRunCheckpoints(runId);
    return ok({ ok: true, items, count: items.length });
  } catch (error) {
    return serverError("Failed to fetch checkpoints", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const parsed = await parseJsonBody(request, upsertCheckpointSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const checkpoint = await upsertSystemRunCheckpoint({
      runId,
      agentKey: parsed.data.agentKey,
      checkpointKey: parsed.data.checkpointKey,
      status: parsed.data.status,
      detailMd: parsed.data.detailMd ?? null,
      metadata: parsed.data.metadata
    });

    return ok({ ok: true, checkpoint });
  } catch (error) {
    return serverError("Failed to upsert checkpoint", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

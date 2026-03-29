import { notFound, ok, serverError, validationError } from "@/lib/api/responses";
import { runAvery } from "@/lib/agents/avery";
import { runLyra } from "@/lib/agents/lyra";
import { runNoah } from "@/lib/agents/noah";
import { runSloan } from "@/lib/agents/sloan";
import { createSystemRun, finishSystemRun } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { runAgentSchema } from "@/lib/validation/agents";
import type { AgentRunResult } from "@/lib/agents/shared";

const runners: Record<string, () => Promise<AgentRunResult>> = {
  sloan: runSloan,
  lyra: runLyra,
  noah: runNoah,
  avery: runAvery
};

export async function POST(request: Request, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  const runner = runners[agentKey];
  if (!runner) return notFound(`Unknown agent: ${agentKey}`);

  const parsed = await parseJsonBody(request, runAgentSchema);
  if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

  const run = await createSystemRun({ agentKey, runType: parsed.data.runType ?? "manual" });

  try {
    const result = await runner();
    await finishSystemRun(run.id, { status: "completed", outputsJson: result });
    return ok({ ok: true, runId: run.id, agentKey, result });
  } catch (error) {
    await finishSystemRun(run.id, {
      status: "failed",
      errorsMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    return serverError("Agent run failed", {
      agentKey,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

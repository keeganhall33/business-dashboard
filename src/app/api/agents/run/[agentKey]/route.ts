import { notFound, ok, serverError, validationError } from "@/lib/api/responses";
import { hasAgentRunner, runAgentByKey } from "@/lib/agents/runAgentByKey";
import { parseJsonBody } from "@/lib/validation/parse";
import { runAgentSchema } from "@/lib/validation/agents";

export async function POST(request: Request, context: { params: Promise<{ agentKey: string }> }) {
  const { agentKey } = await context.params;
  if (!hasAgentRunner(agentKey)) return notFound(`Unknown agent: ${agentKey}`);

  const parsed = await parseJsonBody(request, runAgentSchema);
  if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

  try {
    const { runId, result } = await runAgentByKey(agentKey, parsed.data.runType ?? "manual");
    return ok({ ok: true, runId, agentKey, result });
  } catch (error) {
    return serverError("Agent run failed", {
      agentKey,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

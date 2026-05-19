import { badRequest, ok, serverError } from "@/lib/api/responses";
import { activateAgentTasks } from "@/lib/agents/automation";
import { hasAgentRunner } from "@/lib/agents/runAgentByKey";
import { publishAgentStatusSnapshot } from "@/lib/agents/shared";

export async function POST(_request: Request, context: { params: Promise<{ agentKey: string }> }) {
  try {
    const { agentKey } = await context.params;
    if (!hasAgentRunner(agentKey)) {
      return badRequest(`Unknown agent: ${agentKey}`, { agentKey });
    }

    const activation = await activateAgentTasks(agentKey, { includeAutoRunnable: true });
    const status = await publishAgentStatusSnapshot(agentKey);

    return ok({
      ok: true,
      agentKey,
      activated: activation,
      statusSnapshot: status
    });
  } catch (error) {
    return serverError("Failed to nudge agent", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { badRequest, ok, serverError } from "@/lib/api/responses";
import { enforceDashboardAuth } from "@/lib/auth/dashboard";
import { activateAgentTasks } from "@/lib/agents/automation";
import { hasAgentRunner } from "@/lib/agents/runAgentByKey";
import { publishAgentStatusSnapshot } from "@/lib/agents/shared";

export async function POST(request: Request, context: { params: Promise<{ agentKey: string }> }) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

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

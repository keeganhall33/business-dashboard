import { ok, serverError, validationError } from "@/lib/api/responses";
import { hasAgentRunner, runAgentByKey } from "@/lib/agents/runAgentByKey";
import { getTaskById, updateTaskApproval } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { approveTaskSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, approveTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const existing = await getTaskById(id);
    const task = await updateTaskApproval(id, parsed.data.approvedByUser);

    let runTriggered = false;
    let runError: string | null = null;

    const shouldTriggerRun =
      parsed.data.approvedByUser &&
      existing.requires_approval &&
      !existing.approved_by_user &&
      task.approved_by_user &&
      hasAgentRunner(existing.agent_key);

    if (shouldTriggerRun) {
      try {
        await runAgentByKey(existing.agent_key, "manual");
        runTriggered = true;
      } catch (error) {
        runError = error instanceof Error ? error.message : String(error);
        console.error("Failed to trigger agent after approval", {
          agentKey: task.agent_key,
          taskId: task.id,
          error: runError
        });
      }
    }

    return ok({ ok: true, task, runTriggered, runError });
  } catch (error) {
    return serverError("Failed to approve task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

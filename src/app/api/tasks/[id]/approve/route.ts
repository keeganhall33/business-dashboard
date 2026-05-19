import { ok, serverError, validationError } from "@/lib/api/responses";
import { activateAgentTasks } from "@/lib/agents/automation";
import { getTaskById, updateTaskApproval } from "@/lib/supabase/queries";
import { parseJsonBody } from "@/lib/validation/parse";
import { approveTaskSchema } from "@/lib/validation/tasks";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (process.env.E2E_TEST === "1") {
      const { id } = await context.params;
      const body = (await request.json().catch(() => ({}))) as { approvedByUser?: boolean };
      return ok({ ok: true, task: { id, approved_by_user: Boolean(body.approvedByUser) }, automation: null, automationError: null });
    }
    const { id } = await context.params;
    const parsed = await parseJsonBody(request, approveTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const existing = await getTaskById(id);
    const task = await updateTaskApproval(id, parsed.data.approvedByUser);

    let automation: { activatedCount: number; taskIds: string[] } | null = null;
    let automationError: string | null = null;

    const shouldActivateAutomation =
      parsed.data.approvedByUser &&
      existing.requires_approval &&
      !existing.approved_by_user &&
      task.approved_by_user;

    if (shouldActivateAutomation) {
      try {
        automation = await activateAgentTasks(existing.agent_key);
      } catch (error) {
        automationError = error instanceof Error ? error.message : String(error);
        console.error("Failed to trigger automation after approval", {
          agentKey: task.agent_key,
          taskId: task.id,
          error: automationError
        });
      }
    }

    return ok({ ok: true, task, automation, automationError });
  } catch (error) {
    return serverError("Failed to approve task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

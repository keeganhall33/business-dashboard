import { activateAgentTasks } from "@/lib/agents/automation";
import { notFound, ok, serverError, validationError } from "@/lib/api/responses";
import {
  createAgentMessage,
  createAgentUpdate,
  getAgentPlanById,
  updateAgentPlanStatus
} from "@/lib/supabase/queries";
import { decidePlanSchema } from "@/lib/validation/plans";
import { parseJsonBody } from "@/lib/validation/parse";
import { AgentPlanPayload, writeAgentOutputs } from "@/lib/agents/shared";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const plan = await getAgentPlanById(id);
    if (!plan) return notFound("Plan not found");

    if (plan.status !== "pending") {
      return validationError("Plan is not pending review");
    }

    const parsed = await parseJsonBody(request, decidePlanSchema);
    if (!parsed.success) {
      return validationError(parsed.error.message, parsed.error.issues);
    }

    const body = parsed.data;
    const approver = body.approvedBy ?? "ceo";
    const payload = (plan.payload_json ?? {}) as AgentPlanPayload;

    if (body.decision === "changes_requested") {
      await updateAgentPlanStatus({
        id: plan.id,
        status: "changes_requested",
        rejectionReason: body.feedback ?? null
      });

      if (plan.thread_id) {
        await createAgentMessage({
          threadId: plan.thread_id,
          senderType: "ceo",
          senderKey: approver,
          messageType: "comment",
          body: body.feedback ?? "Changes requested",
          metadata: { reason: body.feedback ?? null }
        });
      }

      return ok({ ok: true, planId: plan.id, status: "changes_requested" });
    }

    try {
      const outputs = await writeAgentOutputs({
        agentKey: plan.agent_key,
        insights: payload.insights,
        actions: payload.actions,
        bigBet: payload.bigBet,
        tasks: payload.tasks,
        opportunities: payload.opportunities
      });

      if (payload.postApprovalUpdates) {
        for (const update of payload.postApprovalUpdates) {
          await createAgentUpdate({
            agentKey: plan.agent_key,
            updateType: update.updateType,
            title: update.title,
            summary: update.summary,
            detailMd: update.detailMd,
            priority: update.priority,
            relatedMetricKeys: update.relatedMetricKeys
          });
        }
      }

      const automation = await activateAgentTasks(plan.agent_key, { includeAutoRunnable: true });

      await updateAgentPlanStatus({ id: plan.id, status: "approved", approvedBy: approver });

      if (plan.thread_id) {
        await createAgentMessage({
          threadId: plan.thread_id,
          senderType: "ceo",
          senderKey: approver,
          messageType: "comment",
          body: body.feedback ?? "Approved",
          metadata: { decision: "approved" }
        });
      }

      return ok({ ok: true, planId: plan.id, status: "approved", outputs, automation });
    } catch (error) {
      return serverError("Failed to publish agent plan", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    return serverError("Failed to decide plan", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

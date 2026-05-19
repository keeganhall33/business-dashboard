import { ok, serverError, validationError } from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/validation/parse";
import { z } from "zod";
import {
  createTask,
  findOpenTaskByTitle,
  getIdeas,
  linkIdeaToTask,
  updateIdeaStatus
} from "@/lib/supabase/queries";
import {
  buildCeoReviewTaskDescription,
  buildCeoReviewTaskTitle,
  shouldEnsureCeoReviewTask
} from "@/lib/idea-board/reviewTasks.mjs";

const bodySchema = z.object({
  ideaId: z.string().optional()
});

/**
 * Ensures every idea requiring CEO approval has a corresponding review task.
 *
 * Side-effect endpoint on purpose (automation / self-healing): do NOT call from GET routes.
 */
export async function POST(request: Request) {
  try {
    if (process.env.E2E_TEST === "1") {
      const parsed = await parseJsonBody(request, bodySchema);
      if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);
      const ideaId = parsed.data.ideaId ?? "idea-1";
      return ok({
        ok: true,
        ensuredCount: 1,
        ensured: [{ ideaId, linkedTaskId: "task-e2e-review-1", action: "created" as const }]
      });
    }
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const result = await getIdeas({ limit: 500 });
    const ideas = parsed.data.ideaId
      ? result.items.filter((idea) => idea.id === parsed.data.ideaId)
      : result.items;

    const ensured: Array<{ ideaId: string; linkedTaskId: string; action: "linked_existing" | "created" }> = [];

    for (const idea of ideas) {
      if (!shouldEnsureCeoReviewTask(idea)) continue;

      const title = buildCeoReviewTaskTitle(idea.title);
      const existing = await findOpenTaskByTitle(idea.agent_key, title);

      if (existing) {
        if (!idea.linked_task_id || idea.linked_task_id !== existing.id) {
          await linkIdeaToTask({ ideaId: idea.id, taskId: existing.id });
        }

        if (idea.status !== "in_review") {
          await updateIdeaStatus({ id: idea.id, status: "in_review", approver: null });
        }

        ensured.push({ ideaId: idea.id, linkedTaskId: existing.id, action: "linked_existing" });
        continue;
      }

      const task = await createTask({
        title,
        description: buildCeoReviewTaskDescription({
          id: idea.id,
          agentKey: idea.agent_key,
          ideaType: idea.idea_type,
          title: idea.title,
          summary: idea.summary,
          expectedImpact: idea.expected_impact
        }),
        agentKey: idea.agent_key,
        priority: "high",
        expectedImpact: idea.expected_impact != null ? String(idea.expected_impact) : undefined,
        impactScore: undefined,
        whyThisMatters: "This idea is blocked on CEO approval. Review and decide so execution can proceed.",
        relatedMetricKeys: [],
        requiresApproval: true,
        executionType: "strategy",
        createdBy: "system"
      });

      await linkIdeaToTask({ ideaId: idea.id, taskId: task.id });
      if (idea.status !== "in_review") {
        await updateIdeaStatus({ id: idea.id, status: "in_review", approver: null });
      }

      ensured.push({ ideaId: idea.id, linkedTaskId: task.id, action: "created" });
    }

    return ok({ ok: true, ensuredCount: ensured.length, ensured });
  } catch (error) {
    return serverError("Failed to sync idea board review tasks", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


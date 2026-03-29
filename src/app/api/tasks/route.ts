import { ok, serverError, validationError } from "@/lib/api/responses";
import { createTask, getTasks } from "@/lib/supabase/queries";
import { parseJsonBody, parseSearchParams } from "@/lib/validation/parse";
import { createTaskSchema, tasksQuerySchema } from "@/lib/validation/tasks";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = parseSearchParams(url.searchParams, tasksQuerySchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const result = await getTasks(parsed.data);
    return ok({ ok: true, items: result.items, count: result.count });
  } catch (error) {
    return serverError("Failed to fetch tasks", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createTaskSchema);
    if (!parsed.success) return validationError(parsed.error.message, parsed.error.issues);

    const task = await createTask({
      title: parsed.data.title,
      description: parsed.data.description,
      agentKey: parsed.data.agentKey,
      priority: parsed.data.priority,
      expectedImpact: parsed.data.expectedImpact,
      impactScore: parsed.data.impactScore,
      whyThisMatters: parsed.data.whyThisMatters,
      relatedMetricKeys: parsed.data.relatedMetricKeys,
      requiresApproval: parsed.data.requiresApproval,
      executionType: parsed.data.executionType,
      createdBy: "user"
    });

    return ok({ ok: true, task });
  } catch (error) {
    return serverError("Failed to create task", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

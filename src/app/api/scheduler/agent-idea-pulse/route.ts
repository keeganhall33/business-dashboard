import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runAgentIdeaPulse } from "@/lib/scheduler/agentIdeaPulse";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runAgentIdeaPulse();
    return ok({ ok: true, job: "agent-idea-pulse", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "agent-idea-pulse",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runDailyAgentCycle } from "@/lib/scheduler/dailyAgentCycle";

export async function POST(request: Request) {
  try {
    assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runDailyAgentCycle();
    return ok({ ok: true, job: "daily-agent-cycle", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "daily-agent-cycle",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runWeeklyCommandCycle } from "@/lib/scheduler/weeklyCommandCycle";

export async function POST(request: Request) {
  try {
    assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runWeeklyCommandCycle();
    return ok({ ok: true, job: "weekly-command-cycle", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "weekly-command-cycle",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

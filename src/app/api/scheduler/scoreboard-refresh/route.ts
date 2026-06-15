import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runScoreboardRefresh } from "@/lib/scheduler/scoreboardRefresh";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runScoreboardRefresh();
    return ok({ ok: true, job: "scoreboard-refresh", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "scoreboard-refresh",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runDailyHealthCheck } from "@/lib/scheduler/dailyHealthCheck";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runDailyHealthCheck();
    return ok({ ok: true, job: "daily-health-check", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "daily-health-check",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runWeeklySummary } from "@/lib/scheduler/weeklySummary";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runWeeklySummary();
    return ok({ ok: true, job: "weekly-summary", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "weekly-summary",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


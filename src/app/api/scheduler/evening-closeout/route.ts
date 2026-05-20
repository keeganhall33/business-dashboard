import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runEveningCloseout } from "@/lib/scheduler/eveningCloseout";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runEveningCloseout();
    return ok({ ok: true, job: "evening-closeout", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "evening-closeout",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

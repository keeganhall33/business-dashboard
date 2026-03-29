import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runMidweekOpportunityPulse } from "@/lib/scheduler/midweekOpportunityPulse";

export async function POST(request: Request) {
  try {
    assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runMidweekOpportunityPulse();
    return ok({ ok: true, job: "midweek-opportunity-pulse", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "midweek-opportunity-pulse",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

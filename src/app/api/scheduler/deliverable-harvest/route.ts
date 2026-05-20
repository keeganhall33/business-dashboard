import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runDeliverableHarvest } from "@/lib/scheduler/deliverableHarvest";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runDeliverableHarvest();
    return ok({ ok: true, job: "deliverable-harvest", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "deliverable-harvest",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}


import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { runTelemetryHealthMonitor } from "@/lib/scheduler/telemetryHealthMonitor";

export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const result = await runTelemetryHealthMonitor();
    return ok({ ok: true, job: "telemetry-health-monitor", result });
  } catch (error) {
    return serverError("Scheduler job failed", {
      job: "telemetry-health-monitor",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

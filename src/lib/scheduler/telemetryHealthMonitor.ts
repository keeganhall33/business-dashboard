import { performTelemetryHealthCheck } from "@/lib/telemetry/healthMonitor";
import { withJobRun } from "./jobLogger";

const JOB_KEY = "telemetry-health-monitor";

export async function runTelemetryHealthMonitor() {
  return withJobRun({
    jobKey: JOB_KEY,
    fn: async () => {
      const result = await performTelemetryHealthCheck();
      return result;
    },
    summarize: (result) => ({
      summary: `events=${result.insertedEvents} alerts+${result.alertsCreatedOrUpdated} alerts-${result.alertsResolved}`,
      detailsJson: result
    })
  });
}

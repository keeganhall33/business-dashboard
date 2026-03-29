import { createJobRunLog, finishJobRunLog, touchScheduledJobLastRun } from "@/lib/supabase/queries";

export async function withJobRun<T>(input: {
  jobKey: string;
  fn: () => Promise<T>;
  summarize?: (result: T) => { summary?: string; detailsJson?: Record<string, unknown> };
}) {
  const run = await createJobRunLog({ jobKey: input.jobKey, status: "running" });

  // Keep `scheduled_jobs.last_run_at` in sync for dashboards / monitoring.
  try {
    await touchScheduledJobLastRun(input.jobKey, run.started_at);
  } catch {
    // Best-effort: do not fail the job if the DB migration hasn't been applied yet.
  }

  try {
    const result = await input.fn();
    const summaryPayload = input.summarize ? input.summarize(result) : {};

    await finishJobRunLog(run.id, {
      status: "completed",
      summary: summaryPayload.summary,
      detailsJson: summaryPayload.detailsJson
    });

    return result;
  } catch (error) {
    await finishJobRunLog(run.id, {
      status: "failed",
      errorMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    throw error;
  }
}

import { ok, serverError, unauthorized } from "@/lib/api/responses";
import { assertSchedulerAuth } from "@/lib/scheduler/auth";
import { computeNextRunAt } from "@/lib/scheduler/cron";
import {
  getScheduledJobs,
  touchScheduledJobLastRun,
  updateScheduledJobNextRun
} from "@/lib/supabase/queries";
import { runDailyAgentCycle } from "@/lib/scheduler/dailyAgentCycle";
import { runDailyHealthCheck } from "@/lib/scheduler/dailyHealthCheck";
import { runProofEnforcementChecks } from "@/lib/scheduler/proofEnforcement";
import { runDeliverableHarvest } from "@/lib/scheduler/deliverableHarvest";
import { runCeoDigest } from "@/lib/scheduler/ceoDigest";
import { runEveningCloseout } from "@/lib/scheduler/eveningCloseout";
import { runWeeklyCommandCycle } from "@/lib/scheduler/weeklyCommandCycle";
import { runWeeklySummary } from "@/lib/scheduler/weeklySummary";
import { runMidweekOpportunityPulse } from "@/lib/scheduler/midweekOpportunityPulse";
import { runAgentIdeaPulse } from "@/lib/scheduler/agentIdeaPulse";
import { runIndustryNewsPulse } from "@/lib/scheduler/industryNewsPulse";
import { runScoreboardRefresh } from "@/lib/scheduler/scoreboardRefresh";
import { runIntelligenceTrafficQualityDaily } from "@/lib/scheduler/intelligenceTrafficQualityDaily";
import { runFusionDailyDecisionV1 } from "@/lib/scheduler/fusionDailyDecisionV1";

export const runtime = "nodejs";

type JobRunner = () => Promise<unknown>;

type ScheduledJobRow = {
  job_key: string;
  cron_expression: string;
  timezone?: string | null;
  next_run_at?: string | null;
};

const runners: Record<string, JobRunner> = {
  "daily-agent-cycle": runDailyAgentCycle,
  "daily-health-check": runDailyHealthCheck,
  "proof-enforcement": runProofEnforcementChecks,
  "deliverable-harvest": runDeliverableHarvest,
  "ceo-digest": runCeoDigest,
  "evening-closeout": runEveningCloseout,
  "weekly-command-cycle": runWeeklyCommandCycle,
  "weekly-summary": runWeeklySummary,
  "midweek-opportunity-pulse": runMidweekOpportunityPulse,
  "agent-idea-pulse": runAgentIdeaPulse,
  "industry-news-pulse": runIndustryNewsPulse,
  "scoreboard-refresh": runScoreboardRefresh,
  "intelligence-traffic-quality": runIntelligenceTrafficQualityDaily,
  "fusion-daily-decision-v1": runFusionDailyDecisionV1
};

/**
 * Central scheduler tick.
 *
 * Call this endpoint every minute from your cron runner.
 * It will:
 * - read `scheduled_jobs`
 * - compute `next_run_at` when missing
 * - run any due jobs (best-effort sequential)
 * - write back the new `next_run_at`
 */
export async function POST(request: Request) {
  try {
    await assertSchedulerAuth(request);
  } catch (error) {
    return unauthorized(error instanceof Error ? error.message : "Unauthorized");
  }

  try {
    const now = new Date();
    const jobs = (await getScheduledJobs({ activeOnly: true })) as ScheduledJobRow[];

    const results: Array<{ jobKey: string; ran: boolean; nextRunAt: string | null; error?: string }> = [];
    let ranCount = 0;

    for (const job of jobs) {
      const jobKey = job.job_key;
      const cronExpression = job.cron_expression;
      const timezone = String(job.timezone ?? "America/Los_Angeles");

      const runner = runners[jobKey];
      if (!runner) {
        results.push({ jobKey, ran: false, nextRunAt: job.next_run_at ?? null, error: "No runner registered" });
        continue;
      }

      const nextRunAt = job.next_run_at ? new Date(job.next_run_at) : null;
      const due = !nextRunAt || nextRunAt.getTime() <= now.getTime();

      if (!due) {
        results.push({ jobKey, ran: false, nextRunAt: nextRunAt.toISOString() });
        continue;
      }

      try {
        // Record the run start immediately so the dashboard reflects activity even
        // if the job runner errors before it can write its own run log.
        await touchScheduledJobLastRun(jobKey, now.toISOString());
        await runner();
        ranCount += 1;
      } catch (error) {
        // Job runners already log failures into job_run_log; we keep the tick alive.
        results.push({
          jobKey,
          ran: true,
          nextRunAt: null,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      const computedNext = computeNextRunAt({ cronExpression, timezone }, now);
      await updateScheduledJobNextRun(jobKey, computedNext.toISOString());
      results.push({ jobKey, ran: true, nextRunAt: computedNext.toISOString() });
    }

    return ok({
      ok: true,
      job: "tick",
      now: now.toISOString(),
      jobsSeen: jobs.length,
      jobsRan: ranCount,
      results
    });
  } catch (error) {
    return serverError("Scheduler tick failed", {
      job: "tick",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

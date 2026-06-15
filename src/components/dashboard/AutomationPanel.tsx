"use client";

import { useCallback, useEffect, useState } from "react";
import { SchedulerJobHealth } from "@/lib/types/dashboard";
import { requestDashboardRefresh } from "@/lib/dashboard/events";
import { publishDashboardToast } from "@/lib/dashboard/toast";
import { ProgressBar } from "./ui/ProgressBar";
import { StatusChip } from "./ui/StatusChip";
import { InsightCard, type InsightObject } from "./ui/InsightCard";

type Props = {
  jobs: SchedulerJobHealth[];
};

const EXPECTED_AUTOMATION = [
  {
    jobKey: "deliverable-harvest",
    label: "Deliverable harvesting",
    cadence: "02:00 PT nightly",
    summary: "Pulls daily deliverables + proof assets into archive storage so enforcement has a clean queue every morning."
  },
  {
    jobKey: "proof-enforcement",
    label: "Proof enforcement reminders",
    cadence: "Event-driven (SLA miss)",
    summary: "Pings the assigned agent the moment a proof, async post, or evidence link misses its SLA."
  },
  {
    jobKey: "ceo-digest",
    label: "CEO war-room digest",
    cadence: "Mondays · 07:30 PT",
    summary: "Generates the executive war-room memo so Keegan and Avery have a single page before the week opens."
  },
  {
    jobKey: "weekly-summary",
    label: "Weekly command summary",
    cadence: "Auto after first daily loop",
    summary: "Compiles the Tue/Fri cadences + logger data once the daily async loop lands, no manual touch."
  }
];

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const OVERDUE_BUFFER_MS = 5 * 60 * 1000; // allow 5 minutes of slack before flagging overdue

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return timeFormatter.format(date);
}

function statusTone(status?: string | null, overdue?: boolean) {
  if (status === "failed") return "text-rose-400";
  if (overdue || !status) return "text-amber-400";
  return "text-emerald-400";
}

function isOverdue(job?: SchedulerJobHealth | null) {
  if (!job) return true;
  if (!job.nextRunAt) return false;
  const nextRun = new Date(job.nextRunAt).getTime();
  if (!Number.isFinite(nextRun)) return false;
  return nextRun + OVERDUE_BUFFER_MS < Date.now();
}

export function AutomationPanel({ jobs }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [runningJobKey, setRunningJobKey] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const runJob = useCallback(
    async (jobKey: string) => {
      if (runningJobKey) return;
      setRunningJobKey(jobKey);
      try {
        const response = await fetch("/api/automation/run-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobKey })
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to run automation job.");
        }

        publishDashboardToast({
          tone: "success",
          title: "Automation job triggered",
          description: `${jobKey} queued from dashboard.`
        });
        requestDashboardRefresh({ reason: `automation:${jobKey}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to run automation job.";
        publishDashboardToast({
          tone: "error",
          title: "Automation run failed",
          description: message
        });
      } finally {
        setRunningJobKey(null);
      }
    },
    [runningJobKey]
  );

  if (!hydrated) {
    return (
      <section className="ui-glass rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-600">Automation cadence</div>
            <div className="mt-1 h-4 w-32 animate-pulse rounded-full bg-zinc-800/80" />
          </div>
          <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-800/80" />
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
              <div className="h-4 w-40 animate-pulse rounded-full bg-zinc-800/70" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full animate-pulse rounded-full bg-zinc-900/60" />
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-zinc-900/60" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const jobMap = new Map(jobs.map((job) => [job.jobKey, job]));
  const prioritized = EXPECTED_AUTOMATION.map((meta) => ({
    ...meta,
    job: jobMap.get(meta.jobKey) ?? null
  }));
  const remaining = jobs.filter((job) => !EXPECTED_AUTOMATION.find((meta) => meta.jobKey === job.jobKey));

  const unhealthyCount = prioritized.filter(({ job }) => !job || job.lastStatus === "failed").length;
  const overdueCount = prioritized.filter(({ job }) => isOverdue(job)).length;
  const healthPct = Math.max(0, Math.min(100, ((prioritized.length - unhealthyCount) / Math.max(1, prioritized.length)) * 100));

  const insightObjects = prioritized.map(({ job, label, cadence, summary, jobKey }): InsightObject => {
    const overdue = isOverdue(job);
    const statusLabel = job ? (job.lastStatus === "failed" ? "Failed" : overdue ? "Overdue" : "Healthy") : "Missing";
    const isActionNeeded = !job || job.lastStatus === "failed" || overdue;
    const isRunning = runningJobKey === jobKey;

    return {
      id: jobKey,
      title: label,
      claim: isActionNeeded
        ? `${label} is ${statusLabel.toLowerCase()} — needs operator attention.`
        : `${label} is healthy and running on schedule.`,
      state: isActionNeeded ? "action_needed" : "supported",
      confidenceLabel: job ? "scheduler telemetry" : "missing telemetry",
      updatedAtLabel: job?.lastRunAt ? `Last run ${formatTimestamp(job.lastRunAt)}` : null,
      definition: summary,
      evidence: [
        { label: "Target cadence", value: cadence },
        { label: "Last status", value: job?.lastStatus ?? "missing" },
        { label: "Last run", value: formatTimestamp(job?.lastRunAt) },
        { label: "Next run", value: formatTimestamp(job?.nextRunAt) },
        { label: "Route", value: job?.routePath ?? "—" }
      ],
      actions: isActionNeeded
        ? [
            {
              label: "Restart automation job",
              detail: "Trigger a manual run directly from the dashboard.",
              onClick: () => runJob(jobKey),
              disabled: isRunning,
              statusLabel: isRunning ? "Running…" : null
            }
          ]
        : [{ label: "View evidence", detail: "Inspect run timestamps + route.", onClick: null }]
    };
  });

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`ui-status-dot ${unhealthyCount > 0 || overdueCount > 0 ? "ui-pulse" : ""}`}
              data-tone={unhealthyCount > 0 || overdueCount > 0 ? "amber" : "emerald"}
            />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Automation cadence</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">Deliverables + enforcement</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusChip
            label={unhealthyCount > 0 ? `${unhealthyCount} needs attention` : "HEALTHY"}
            tone={unhealthyCount > 0 ? "amber" : "emerald"}
          />
          <div className="w-36">
            <ProgressBar value={healthPct} tone={unhealthyCount > 0 ? "amber" : "emerald"} className="bg-black/25" />
          </div>
          {overdueCount > 0 ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
              Automation overdue · {overdueCount} job{overdueCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Automation insights</div>
            <StatusChip label={unhealthyCount > 0 ? `${unhealthyCount} action needed` : "All supported"} tone={unhealthyCount > 0 ? "amber" : "emerald"} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {insightObjects.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>

        {prioritized.map(({ job, label, cadence, summary, jobKey }) => {
          const overdue = isOverdue(job);
          const statusLabel = job
            ? job.lastStatus === "failed"
              ? "Failed"
              : overdue
                ? "Overdue"
                : "Healthy"
            : "Missing";
          const statusClass = job ? statusTone(job.lastStatus, overdue) : "text-amber-400";
          const dotTone = !job ? "amber" : job.lastStatus === "failed" ? "rose" : overdue ? "amber" : "emerald";
          return (
            <div key={jobKey} className="ui-glass-hover rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`ui-status-dot ${statusLabel !== "Healthy" ? "ui-pulse" : ""}`} data-tone={dotTone} />
                    <div className="text-sm font-semibold text-zinc-100">{label}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">Target cadence: {cadence}</div>
                </div>
                <div className={`text-xs font-semibold ${statusClass}`}>{statusLabel}</div>
              </div>
              <p className="mt-2 text-sm text-zinc-400">{summary}</p>
              <div className="mt-3">
                <div className="ui-sweep h-1.5 w-full rounded-full opacity-60" />
              </div>
              <div className="mt-3 grid gap-3 text-xs text-zinc-500 lg:grid-cols-3">
                <div>
                  <div className="font-semibold text-zinc-300">Last run</div>
                  <div>{formatTimestamp(job?.lastRunAt)}</div>
                </div>
                <div>
                  <div className="font-semibold text-zinc-300">Next run</div>
                  <div>{formatTimestamp(job?.nextRunAt)}</div>
                </div>
                <div>
                  <div className="font-semibold text-zinc-300">Scheduler route</div>
                  <div className="truncate text-zinc-400">{job?.routePath ?? "—"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {remaining.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Other automation</div>
          <div className="mt-3 space-y-2">
            {remaining.map((job) => (
              <div
                key={job.jobKey}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-sm text-zinc-300 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-semibold text-zinc-100">{job.jobName}</div>
                  <div className="text-xs text-zinc-500">{job.cronExpression}</div>
                </div>
                <div className="mt-2 grid gap-3 text-xs text-zinc-500 md:mt-0 md:grid-cols-2">
                  <span>Last: {formatTimestamp(job.lastRunAt)}</span>
                  <span>Next: {formatTimestamp(job.nextRunAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { SchedulerJobHealth } from "@/lib/types/dashboard";
import { ProgressBar } from "./ui/ProgressBar";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  jobs: SchedulerJobHealth[];
};

const EXPECTED_AUTOMATION = [
  {
    jobKey: "deliverable_harvest",
    label: "Deliverable harvesting",
    cadence: "02:00 PT nightly",
    summary: "Pulls daily deliverables + proof assets into archive storage so enforcement has a clean queue every morning."
  },
  {
    jobKey: "proof_enforcement",
    label: "Proof enforcement reminders",
    cadence: "Event-driven (SLA miss)",
    summary: "Pings the assigned agent the moment a proof, async post, or evidence link misses its SLA."
  },
  {
    jobKey: "ceo_war_room_digest",
    label: "CEO war-room digest",
    cadence: "Mondays · 07:30 PT",
    summary: "Generates the executive war-room memo so Keegan and Avery have a single page before the week opens."
  },
  {
    jobKey: "weekly_summary_compile",
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

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return timeFormatter.format(date);
}

function statusTone(status?: string | null) {
  if (status === "failed") return "text-rose-400";
  if (!status) return "text-amber-400";
  return "text-emerald-400";
}

export function AutomationPanel({ jobs }: Props) {
  const jobMap = new Map(jobs.map((job) => [job.jobKey, job]));
  const prioritized = EXPECTED_AUTOMATION.map((meta) => ({
    ...meta,
    job: jobMap.get(meta.jobKey) ?? null
  }));
  const remaining = jobs.filter((job) => !EXPECTED_AUTOMATION.find((meta) => meta.jobKey === job.jobKey));

  const unhealthyCount = prioritized.filter(({ job }) => !job || job.lastStatus === "failed").length;
  const healthPct = Math.max(0, Math.min(100, ((prioritized.length - unhealthyCount) / Math.max(1, prioritized.length)) * 100));

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`ui-status-dot ${unhealthyCount > 0 ? "ui-pulse" : ""}`}
              data-tone={unhealthyCount > 0 ? "amber" : "emerald"}
            />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Automation cadence</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">Deliverables + enforcement</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusChip label={unhealthyCount > 0 ? `${unhealthyCount} needs attention` : "HEALTHY"} tone={unhealthyCount > 0 ? "amber" : "emerald"} />
          <div className="w-36">
            <ProgressBar value={healthPct} tone={unhealthyCount > 0 ? "amber" : "emerald"} className="bg-black/25" />
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {prioritized.map(({ job, label, cadence, summary, jobKey }) => {
          const statusLabel = job ? (job.lastStatus === "failed" ? "Failed" : "Healthy") : "Missing";
          const statusClass = job ? statusTone(job.lastStatus) : "text-amber-400";
          const dotTone = !job ? "amber" : job.lastStatus === "failed" ? "rose" : "emerald";
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

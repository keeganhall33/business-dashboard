import type { OperationsIntel } from "@/lib/operations-intelligence";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { RecommendationList } from "./ui/RecommendationList";
import { AutoLinkText } from "./ui/AutoLinkText";

export function OperationsReliabilityPanel({ intel }: { intel: OperationsIntel }) {
  return (
    <section className="ui-glass ui-glass-hover space-y-5 rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Operations</div>
          <p className="text-sm text-zinc-400">Reliability, incidents, and required intervention</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Overall status" badgeTone={intel.overall.tone} summary={intel.overall.detail} updatedAt={intel.overall.updatedAt} />
        <SiteHealthCard site={intel.site} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Active incidents" items={intel.incidents} empty="No incidents open.">
          {(incident) => (
            <li key={incident.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between text-sm font-semibold text-white">
                <span>{incident.title}</span>
                <SeverityPill severity={incident.severity} />
              </div>
              <p className="mt-1 text-sm text-zinc-400">{incident.detail}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">{relativeLabel(incident.detectedAt)}</p>
            </li>
          )}
        </ListCard>
        <ListCard title="Failed jobs" items={intel.failedJobs} empty="All monitored jobs succeeded.">
          {(job) => (
            <JobRow key={`failed-${job.id}`} job={job} tone="rose" />
          )}
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Overdue jobs" items={intel.overdueJobs} empty="No overdue jobs.">
          {(job) => (
            <JobRow key={`overdue-${job.id}`} job={job} tone="amber" />
          )}
        </ListCard>
        <ListCard title="Needs human intervention" items={intel.humanIntervention} empty="No approvals or decisions waiting.">
          {(item) => (
            <li key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <p className="mt-1 text-sm text-zinc-400">{item.summary}</p>
              <p className="mt-2 text-xs text-zinc-500">{item.executionPath}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                <span>{item.owner}</span>
                <span>{relativeLabel(item.createdAt)}</span>
              </div>
            </li>
          )}
        </ListCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Stale workflows" items={intel.staleWorkflows} empty="No workflows have missed their cadence.">
          {(workflow) => (
            <li key={workflow.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-sm font-semibold text-white">{workflow.label}</div>
              <p className="mt-1 text-sm text-zinc-400">{workflow.reason}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Owner: {workflow.owner}</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Last run {relativeLabel(workflow.lastRunAt)}</p>
            </li>
          )}
        </ListCard>
        <ListCard title="Latest automated deliverables" items={intel.deliverables} empty="No recent deliverables captured.">
          {(deliverable) => (
            <li key={deliverable.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="text-sm font-semibold text-white">{deliverable.title}</div>
              <p className="mt-1 text-sm text-zinc-400">
                <AutoLinkText value={deliverable.summary ?? ""} />
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                <span>{deliverable.owner}</span>
                <span>{relativeLabel(deliverable.completedAt)}</span>
              </div>
              {deliverable.links ? (
                <p className="mt-1 text-xs text-zinc-500">{deliverable.links} attachment{deliverable.links === 1 ? "" : "s"}</p>
              ) : null}
            </li>
          )}
        </ListCard>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Operational actions</p>
        <div className="mt-3">
          <RecommendationList
            items={intel.actions.map((action) => ({
              id: action.id,
              title: action.title,
              whyNow: action.detail,
              impact: action.detail,
              evidence: action.detail,
              confidence: "Operational",
              nextStep: action.owner ? `Coordinate with ${action.owner}` : "Assign owner",
              owner: action.owner,
              badges: [action.urgency]
            }))}
            empty="No additional actions required."
          />
        </div>
      </div>
    </section>
  );
}

function StatusCard({ title, badgeTone, summary, updatedAt }: { title: string; badgeTone: "emerald" | "amber" | "rose"; summary: string; updatedAt: string | null }) {
  const toneClass = badgeTone === "rose" ? "bg-rose-500/10 text-rose-200 border-rose-500/40" : badgeTone === "amber" ? "bg-amber-500/10 text-amber-200 border-amber-500/40" : "bg-emerald-500/10 text-emerald-200 border-emerald-500/40";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{title}</p>
          <p className="mt-2 text-sm text-zinc-300">{summary}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${toneClass}`}>{badgeTone}</span>
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">Updated {relativeLabel(updatedAt)}</p>
    </div>
  );
}

function SiteHealthCard({ site }: { site: OperationsIntel["site"] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Site health</p>
      <p className="mt-2 text-sm text-zinc-200">{site.detail}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <HealthPill label="Availability" value={site.availability} />
        <HealthPill label="Performance" value={site.performance} />
        <HealthPill label="Security" value={site.security} />
      </div>
      {site.issues.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-500">
          {site.issues.slice(0, 3).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-zinc-500">Verified {relativeLabel(site.lastChecked)}</p>
    </div>
  );
}

function HealthPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 px-3 py-4 text-sm text-zinc-200">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function ListCard<T>({ title, items, empty, children }: { title: string; items: T[]; empty: string; children: (item: T) => React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{title}</p>
      {items.length ? <ul className="mt-3 space-y-3">{items.map((item) => children(item))}</ul> : <p className="mt-3 text-sm text-zinc-500">{empty}</p>}
    </div>
  );
}

function SeverityPill({ severity }: { severity: "warning" | "critical" }) {
  const toneClass = severity === "critical" ? "bg-rose-500/10 text-rose-200 border-rose-500/40" : "bg-amber-500/10 text-amber-200 border-amber-500/40";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.25em] ${toneClass}`}>{severity}</span>;
}

function JobRow({ job, tone }: { job: OperationsIntel["failedJobs"][number]; tone: "rose" | "amber" }) {
  const toneClass = tone === "rose" ? "text-rose-200" : "text-amber-200";
  return (
    <li className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="text-sm font-semibold text-white">{job.title}</div>
      <p className={`mt-1 text-sm ${toneClass}`}>{job.detail}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500">Last run {relativeLabel(job.lastRunAt)}</p>
    </li>
  );
}

function relativeLabel(value: string | null) {
  if (!value) return "unknown";
  return formatRelativeTimeFromNow(value);
}

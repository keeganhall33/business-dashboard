import type {
  DataEvidenceTruthStateV1,
  ExecutiveDataEvidenceViewV1
} from "@/lib/data-evidence/executive-data-evidence-v1";
import { SocialConnectorHealthPanelV1 } from "@/components/data-evidence/SocialConnectorHealthPanelV1";
import type { SocialConnectorHealthSurfaceV1 } from "@/lib/social-intelligence/load-social-connector-health-v1";

const STATE_TONE: Record<DataEvidenceTruthStateV1, string> = {
  LIVE: "border-emerald-200 bg-emerald-50 text-emerald-900",
  PARTIAL: "border-sky-200 bg-sky-50 text-sky-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNAVAILABLE: "border-slate-300 bg-slate-100 text-slate-800",
  WARNING: "border-amber-200 bg-amber-50 text-amber-900",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-900",
  UNKNOWN: "border-slate-300 bg-white text-slate-700"
};

function displayTimestamp(value: string | null): string {
  if (!value) return "UNKNOWN";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

export function ExecutiveDataEvidenceWorkspaceV1({
  view,
  socialConnectorHealth
}: {
  view: ExecutiveDataEvidenceViewV1;
  socialConnectorHealth?: SocialConnectorHealthSurfaceV1 | null;
}) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" data-testid="executive-data-evidence-workspace-v1">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Data status</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Are your business connections working?</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                See what is connected, when it last updated, what it powers, and what needs attention.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="sr-only">{`Trust posture: ${view.overallState}`}</span>
              <StateChip state={view.overallState} label={view.overallState === "LIVE" ? "All systems current" : "Needs attention"} />
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <SummaryMetric label="Sources monitored" value={view.counts.sourceCount} />
            <SummaryMetric label="Current" value={view.counts.liveCount} />
            <SummaryMetric label="Need attention" value={view.counts.sourceCount - view.counts.liveCount} />
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Connections</p>
              <h2 className="mt-1 text-xl font-semibold">Your business data</h2>
            </div>
            <p className="text-xs text-slate-500">Overview generated: {displayTimestamp(view.generatedAt)}</p>
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.1em] text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-3">Source</th>
                  <th className="border-b border-slate-200 px-3 py-3">State</th>
                  <th className="border-b border-slate-200 px-3 py-3">What it powers</th>
                  <th className="border-b border-slate-200 px-3 py-3">Last updated</th>
                  <th className="border-b border-slate-200 px-3 py-3">What to do</th>
                </tr>
              </thead>
              <tbody>
                {view.sourceRows.map((row) => (
                  <tr key={row.source}>
                    <td className="border-b border-slate-100 px-3 py-4 font-semibold text-slate-950">{row.label}</td>
                    <td className="border-b border-slate-100 px-3 py-4"><StateChip state={row.truthState} /></td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-700">{row.businessUse}</td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-600">{displayTimestamp(row.lastVerifiedAt)}</td>
                    <td className="border-b border-slate-100 px-3 py-4 text-slate-600">{row.nextAction ?? "Nothing. This source is current."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            {view.sourceRows.map((row) => (
              <article key={row.source} className="rounded-2xl border border-slate-200 bg-[#ffffff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-slate-950">{row.label}</h3>
                  <StateChip state={row.truthState} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Detail label="Powers" value={row.businessUse} />
                  <Detail label="Last updated" value={displayTimestamp(row.lastVerifiedAt)} />
                  <Detail label="Next step" value={row.nextAction ?? "Nothing. This source is current."} />
                </dl>
              </article>
            ))}
          </div>
        </section>

        {socialConnectorHealth ? <SocialConnectorHealthPanelV1 surface={socialConnectorHealth} /> : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-[#ffffff] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Automatic refreshes</p>
                <h2 className="mt-1 text-xl font-semibold">Update schedule</h2>
              </div>
              <StateChip state={view.scheduler.state} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Detail label="Automatic updates" value={view.scheduler.cronEnabled == null ? "Not reported" : view.scheduler.cronEnabled ? "On" : "Off"} />
              <Detail label="Active updates" value={numberOrUnknown(view.scheduler.jobCount)} />
              <Detail label="Failed" value={numberOrUnknown(view.scheduler.failingCount)} />
              <Detail label="Never reported" value={numberOrUnknown(view.scheduler.missingTelemetryCount)} />
            </dl>
            <p className="mt-4 text-xs text-slate-500">Last scheduler update: {displayTimestamp(view.scheduler.lastUpdatedAt)}</p>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Needs attention</p>
            <h2 className="mt-1 text-xl font-semibold">What should be fixed</h2>
            {view.verificationGaps.length ? (
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                {view.verificationGaps.map((gap) => (
                  <li key={gap} className="rounded-2xl border border-slate-200 bg-[#ffffff] p-3">{gap}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                No verification gap is exposed by the current dashboard overview.
              </p>
            )}
          </article>
        </section>

        <p className="px-1 text-xs leading-5 text-slate-500">Connection details are shown without exposing passwords or private credentials.</p>
      </div>
    </main>
  );
}

function StateChip({ state, label }: { state: DataEvidenceTruthStateV1; label?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATE_TONE[state]}`}>
      {label ?? state}
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function numberOrUnknown(value: number | null): string {
  return value == null ? "UNKNOWN" : String(value);
}

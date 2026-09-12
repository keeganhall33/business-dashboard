import type {
  DataEvidenceTruthStateV1,
  ExecutiveDataEvidenceViewV1
} from "@/lib/data-evidence/executive-data-evidence-v1";

const STATE_TONE: Record<DataEvidenceTruthStateV1, string> = {
  LIVE: "border-emerald-200 bg-emerald-50 text-emerald-900",
  PARTIAL: "border-sky-200 bg-sky-50 text-sky-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNAVAILABLE: "border-stone-300 bg-stone-100 text-stone-800",
  WARNING: "border-amber-200 bg-amber-50 text-amber-900",
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-900",
  UNKNOWN: "border-stone-300 bg-white text-stone-700"
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
  view
}: {
  view: ExecutiveDataEvidenceViewV1;
}) {
  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="executive-data-evidence-workspace-v1">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Data &amp; Evidence</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Can the dashboard trust its inputs right now?</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600 md:text-base">
                Live coverage, freshness, source health, access state, and ingestion evidence from the same canonical dashboard overview. Missing evidence stays unknown instead of being treated as healthy or zero.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StateChip state={view.overallState} label={`Trust posture: ${view.overallState}`} />
              <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                Data mode: {view.dataMode}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <SummaryMetric label="Live" value={view.counts.liveCount} />
            <SummaryMetric label="Partial" value={view.counts.partialCount} />
            <SummaryMetric label="Stale" value={view.counts.staleCount} />
            <SummaryMetric label="Warnings" value={view.counts.warningCount} />
            <SummaryMetric label="Critical" value={view.counts.criticalCount} />
            <SummaryMetric label="Unavailable" value={view.counts.unavailableCount} />
            <SummaryMetric label="Unknown" value={view.counts.unknownCount} />
          </div>
        </header>

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Source coverage</p>
              <h2 className="mt-1 text-xl font-semibold">Live evidence matrix</h2>
            </div>
            <p className="text-xs text-stone-500">Overview generated: {displayTimestamp(view.generatedAt)}</p>
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.1em] text-stone-500">
                  <th className="border-b border-stone-200 px-3 py-3">Source</th>
                  <th className="border-b border-stone-200 px-3 py-3">State</th>
                  <th className="border-b border-stone-200 px-3 py-3">Freshness</th>
                  <th className="border-b border-stone-200 px-3 py-3">Coverage</th>
                  <th className="border-b border-stone-200 px-3 py-3">Health</th>
                  <th className="border-b border-stone-200 px-3 py-3">Access</th>
                  <th className="border-b border-stone-200 px-3 py-3">Last verified</th>
                  <th className="border-b border-stone-200 px-3 py-3">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {view.sourceRows.map((row) => (
                  <tr key={row.source}>
                    <td className="border-b border-stone-100 px-3 py-4 font-semibold text-stone-950">{row.label}</td>
                    <td className="border-b border-stone-100 px-3 py-4"><StateChip state={row.truthState} /></td>
                    <td className="border-b border-stone-100 px-3 py-4 uppercase text-stone-700">{row.freshness}</td>
                    <td className="border-b border-stone-100 px-3 py-4 uppercase text-stone-700">{row.coverage}</td>
                    <td className="border-b border-stone-100 px-3 py-4 uppercase text-stone-700">{row.health}</td>
                    <td className="border-b border-stone-100 px-3 py-4 text-stone-700">{row.accessStatus}</td>
                    <td className="border-b border-stone-100 px-3 py-4 text-stone-600">{displayTimestamp(row.lastVerifiedAt)}</td>
                    <td className="border-b border-stone-100 px-3 py-4 text-stone-600">
                      {row.warnings.length ? row.warnings.join(", ") : "None reported"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            {view.sourceRows.map((row) => (
              <article key={row.source} className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-stone-950">{row.label}</h3>
                  <StateChip state={row.truthState} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Detail label="Freshness" value={row.freshness.toUpperCase()} />
                  <Detail label="Coverage" value={row.coverage.toUpperCase()} />
                  <Detail label="Health" value={row.health.toUpperCase()} />
                  <Detail label="Access" value={row.accessStatus} />
                  <Detail label="Last verified" value={displayTimestamp(row.lastVerifiedAt)} />
                  <Detail label="Warnings" value={row.warnings.length ? row.warnings.join(", ") : "None reported"} />
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Ingestion health</p>
                <h2 className="mt-1 text-xl font-semibold">Scheduler</h2>
              </div>
              <StateChip state={view.scheduler.state} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Detail label="Cron enabled" value={view.scheduler.cronEnabled == null ? "UNKNOWN" : view.scheduler.cronEnabled ? "YES" : "NO"} />
              <Detail label="Jobs" value={numberOrUnknown(view.scheduler.jobCount)} />
              <Detail label="Failing" value={numberOrUnknown(view.scheduler.failingCount)} />
              <Detail label="Missing telemetry" value={numberOrUnknown(view.scheduler.missingTelemetryCount)} />
            </dl>
            <p className="mt-4 text-xs text-stone-500">Last scheduler update: {displayTimestamp(view.scheduler.lastUpdatedAt)}</p>
          </article>

          <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Verification gaps</p>
            <h2 className="mt-1 text-xl font-semibold">What still needs proof</h2>
            {view.verificationGaps.length ? (
              <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-700">
                {view.verificationGaps.map((gap) => (
                  <li key={gap} className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-3">{gap}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                No verification gap is exposed by the current dashboard overview.
              </p>
            )}
          </article>
        </section>

        <p className="px-1 text-xs leading-5 text-stone-500">
          This workspace is read-only. It does not connect providers, expose credential locations, change ingestion, or infer missing business impact.
        </p>
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
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-950">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function numberOrUnknown(value: number | null): string {
  return value == null ? "UNKNOWN" : String(value);
}

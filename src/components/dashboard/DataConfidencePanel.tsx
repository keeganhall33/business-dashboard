import { buildDataConfidence, type DataConfidenceSummary } from "@/lib/dashboard/executive-layout";
import { ExecutiveBrief, TelemetryHealth, TelemetryMetadata, TelemetrySource } from "@/lib/types/dashboard";

export function DataConfidencePanel({
  metadata,
  health,
  brief,
  summary: provided
}: {
  metadata?: Partial<Record<TelemetrySource, TelemetryMetadata>> | null;
  health?: Partial<Record<TelemetrySource, TelemetryHealth>> | null;
  brief?: ExecutiveBrief | null;
  summary?: DataConfidenceSummary;
}) {
  const summary = provided ?? buildDataConfidence(metadata, health, brief);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Data Confidence</div>
          <p className="text-sm text-zinc-400">Consolidated source & telemetry status</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${summary.overall.tone}`}>{summary.overall.label}</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/5">
        <table className="w-full text-sm text-zinc-200">
          <thead className="bg-white/5 text-[11px] uppercase tracking-[0.25em] text-zinc-400">
            <tr>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Freshness</th>
              <th className="px-4 py-3 text-left">Coverage</th>
              <th className="px-4 py-3 text-left">Last Success</th>
              <th className="px-4 py-3 text-left">Warning</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.source} className="border-t border-white/5">
                <td className="px-4 py-3 font-semibold uppercase tracking-[0.2em] text-zinc-400">{row.source.toUpperCase()}</td>
                <td className="px-4 py-3 text-white">{row.status}</td>
                <td className="px-4 py-3 text-zinc-300">{row.freshness}</td>
                <td className="px-4 py-3 text-zinc-300">{row.coverage}</td>
                <td className="px-4 py-3 text-zinc-300">{row.lastSuccess ?? "—"}</td>
                <td className="px-4 py-3 text-amber-300">{row.warning ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

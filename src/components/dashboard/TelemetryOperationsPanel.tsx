import type {
  TelemetryHealth,
  TelemetryHealthEvent,
  TelemetryMetadata,
  TelemetrySource
} from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

const SOURCE_LABELS: Record<TelemetrySource, string> = {
  woo: "WooCommerce",
  ga4: "Google Analytics",
  funnelkit: "FunnelKit",
  meta: "Meta Ads"
};

const STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "zinc"> = {
  healthy: "emerald",
  warning: "amber",
  critical: "rose",
  unknown: "zinc"
};

const FRESHNESS_LABEL: Record<string, string> = {
  fresh: "Fresh",
  stale: "Stale",
  "no_data": "No data",
  unknown: "Unknown"
};

const SOURCES: TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];

type Props = {
  metadata?: Partial<Record<TelemetrySource, TelemetryMetadata>>;
  health?: Partial<Record<TelemetrySource, TelemetryHealth>>;
  history?: TelemetryHealthEvent[];
};

export function TelemetryOperationsPanel({ metadata = {}, health = {}, history = [] }: Props) {
  const historyBySource = new Map<TelemetrySource, TelemetryHealthEvent>();
  history.forEach((event) => {
    if (!historyBySource.has(event.source)) {
      historyBySource.set(event.source, event);
    }
  });

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-500">Telemetry Status</div>
          <p className="mt-1 text-sm text-zinc-400">Automatic health monitor for Woo, GA4, FunnelKit, and Meta.</p>
        </div>
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {SOURCES.map((source) => {
          const meta = metadata[source];
          const sourceHealth = health[source];
          const latest = historyBySource.get(source);
          const tone = STATUS_TONE[sourceHealth?.status ?? "unknown"];
          return (
            <div key={source} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{SOURCE_LABELS[source]}</div>
                  <div className="text-xs text-zinc-500">Last window {meta?.requestedStartDate ?? "—"} → {meta?.requestedEndDate ?? "—"}</div>
                </div>
                <StatusChip label={formatStatus(sourceHealth?.status)} tone={tone} />
              </div>

              <dl className="mt-3 space-y-1 text-xs text-zinc-400">
                <div className="flex items-center justify-between">
                  <dt>Freshness</dt>
                  <dd>{FRESHNESS_LABEL[meta?.freshnessStatus ?? "unknown"]}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Coverage</dt>
                  <dd>{meta?.coverageStatus ?? "unknown"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Warnings</dt>
                  <dd>{meta?.warningCodes?.length ?? 0}</dd>
                </div>
                {latest ? (
                  <div className="flex items-center justify-between">
                    <dt>Last check</dt>
                    <dd>{new Date(latest.observedAt).toLocaleString()}</dd>
                  </div>
                ) : null}
              </dl>

              {latest?.warningCodes?.length ? (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  {latest.warningCodes.join(", ")}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatStatus(status: TelemetryHealth["status"] | undefined) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

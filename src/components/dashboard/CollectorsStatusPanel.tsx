import type { CollectorTelemetrySnapshot } from "@/lib/types/dashboard";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

type Props = {
  snapshot: CollectorTelemetrySnapshot;
};

export function CollectorsStatusPanel({ snapshot }: Props) {
  const totalLabel = `${integerFormatter.format(snapshot.totals.totalRecords)} total`;
  const wooLabel = `${integerFormatter.format(snapshot.totals.wooRecords)} Woo-derived`;
  const manualLabel = `${integerFormatter.format(snapshot.totals.manualRecords)} manual`;
  const estimatedValue = currencyFormatter.format(snapshot.totals.estimatedValueUsd);
  const wooSliceValue = currencyFormatter.format(snapshot.wooSliceValueUsd);
  const wooSliceDetail = `WooCommerce slice: ${wooSliceValue} across ${integerFormatter.format(snapshot.totals.wooRecords)} imported records`;
  const tierLabel = formatCounts(snapshot.tiers, ["A", "B", "C", "UNRATED", "UNKNOWN"]);
  const priorityLabel = formatCounts(snapshot.priorities, ["critical", "high", "medium", "low", "unknown"]);
  const relationshipLabel = formatCounts(snapshot.relationships, ["active", "recent", "quiet", "dormant"], {
    fallbackOrder: true
  });
  const newestTouch = formatIsoDate(snapshot.lastTouch.newest);
  const oldestTouch = formatIsoDate(snapshot.lastTouch.oldest);
  const lastTouchWindow = `${newestTouch} · ${oldestTouch}`;
  const lastImported = formatPacificTimestamp(snapshot.lastImportedAt);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="ui-status-dot" data-tone="amber" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Collectors</div>
            <div className="mt-1 text-lg font-semibold text-zinc-50">{snapshot.statusLabel}</div>
            <p className="mt-1 text-sm text-amber-200">Limited imported relationship slice. No automation or outreach implied.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-amber-200">
            {snapshot.statusLabel}
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">
            {snapshot.freshnessCopy}
          </span>
        </div>
        <p className="text-xs text-zinc-400">{snapshot.statusDetail}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Collector records" value={totalLabel} detail={`${wooLabel} · ${manualLabel}`} />
          <MetricCard label="Estimated value represented" value={estimatedValue} detail={wooSliceDetail} />
          <MetricCard label="Tier counts" value={tierLabel || "—"} />
          <MetricCard label="Priority counts" value={priorityLabel || "—"} />
          <MetricCard label="Relationship status" value={relationshipLabel || "—"} detail="Active counts reflect logged outreach only" />
          <MetricCard label="Last imported" value={lastImported} detail="Status: PARTIAL · Woo import · stale touchpoints" />
          <MetricCard label="Last touch window" value={lastTouchWindow} detail="Newest · Oldest" />
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-50">
          <p>{snapshot.sourceNote}</p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-zinc-50">{value}</div>
      {detail ? <div className="mt-1 text-xs text-zinc-400">{detail}</div> : null}
    </div>
  );
}

function formatCounts(
  counts: Record<string, number>,
  preferredOrder: string[],
  options?: { fallbackOrder?: boolean }
) {
  const entries = Object.entries(counts ?? {});
  if (!entries.length) return "";
  const normalized = entries.map(([key, value]) => ({ key: key.toLowerCase(), value }));
  const orderedKeys = preferredOrder.map((key) => key.toLowerCase());
  const ordered = normalized
    .filter((entry) => orderedKeys.includes(entry.key))
    .sort((a, b) => orderedKeys.indexOf(a.key) - orderedKeys.indexOf(b.key));

  const remainder = normalized.filter((entry) => !orderedKeys.includes(entry.key));
  const finalList = options?.fallbackOrder ? ordered.concat(remainder) : ordered.length ? ordered : remainder;

  return finalList
    .filter((entry) => entry.value != null)
    .map((entry) => `${capitalize(entry.key)} ${entry.value}`)
    .join(" · ");
}

function capitalize(value: string) {
  if (!value) return value;
  if (value.length === 1) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatIsoDate(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function formatPacificTimestamp(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} PDT`;
}

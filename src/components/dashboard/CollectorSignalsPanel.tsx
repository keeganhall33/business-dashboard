"use client";

import type { CollectorRelationship, CollectorTelemetrySnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

type Props = {
  collectors: CollectorRelationship[];
  telemetry?: CollectorTelemetrySnapshot | null;
};

export function CollectorSignalsPanel({ collectors, telemetry }: Props) {
  const totalRecords = telemetry?.totals.totalRecords ?? collectors.length;
  const manualCount = telemetry?.totals.manualRecords ?? collectors.filter((collector) => !isWooSource(collector.source)).length;
  const wooCount = telemetry?.totals.wooRecords ?? collectors.filter((collector) => isWooSource(collector.source)).length;
  const estimatedValue = telemetry?.totals.estimatedValueUsd ?? sumBy(collectors, (collector) => collector.estimatedValue ?? 0);
  const freshnessDays = telemetry?.lastTouch?.freshnessDaysRounded ?? null;
  const stale = freshnessDays != null && freshnessDays > 30;
  const newestTouch = telemetry?.lastTouch?.newest;
  const lastImport = telemetry?.lastImportedAt;

  const manualCollectors = collectors.filter((collector) => !isWooSource(collector.source));
  const wooCollectors = collectors.filter((collector) => isWooSource(collector.source));
  const warmFollowUps = buildWarmFollowUps(manualCollectors);
  const wooNeedsVerification = wooCollectors.slice(0, 4);
  const tierBreakdown = telemetry?.tiers ? recordToArray(telemetry.tiers) : buildBreakdown(manualCollectors, (collector) => (collector.tier ?? "Unknown").toUpperCase());
  const relationshipBreakdown = telemetry?.relationships ? recordToArray(telemetry.relationships) : buildBreakdown(manualCollectors, (collector) => normalizeStatus(collector.status));

  if (!collectors.length && !telemetry) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Collector signals</p>
        <p className="mt-2">
          No collector data loaded. Run the Supabase `collector_relationships` import or add Tier A/B collectors manually before rendering this panel.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Collector signals</p>
          <p className="text-sm text-zinc-400">Supabase collector_relationships · Manual vs Woo imports</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
          <StatusChip label={telemetry?.statusLabel ?? "Data snapshot"} tone={telemetryStatusTone(telemetry?.status)} />
          {stale ? <StatusChip label="Stale >30d" tone="rose" /> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <SummaryCard label="Total records" value={numberFormatter.format(totalRecords)} sublabel={telemetry?.sourceNote ?? "Combined manual + Woo imports"} />
        <SummaryCard label="Manual / verified" value={numberFormatter.format(manualCount)} sublabel="Human curated" />
        <SummaryCard label="Woo imports" value={numberFormatter.format(wooCount)} sublabel="Needs verification" />
        <SummaryCard label="Estimated pipeline" value={currencyFormatter.format(estimatedValue)} sublabel="Based on collector estimated value" />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <SummaryCard label="Latest touch" value={newestTouch ? formatRelative(newestTouch) : "Unknown"} sublabel={freshnessDays != null ? telemetry?.freshnessCopy : "No touchpoints logged"} />
        <SummaryCard label="Last data import" value={lastImport ? formatRelative(lastImport) : "Unknown"} sublabel="Woo/manual ingest timestamp" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <BreakdownCard title="Tier mix" items={tierBreakdown} fallback="No tier data" />
        <BreakdownCard title="Relationship status" items={relationshipBreakdown} fallback="No status data" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Warm follow-up candidates</p>
              <p className="text-xs text-zinc-500">Tier A/B · quiet or overdue next move</p>
            </div>
            <StatusChip label={`${warmFollowUps.length}`} tone="sky" />
          </header>
          <div className="mt-3 space-y-3">
            {warmFollowUps.length ? (
              warmFollowUps.map((collector) => (
                <article key={collector.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between text-sm text-white">
                    <span>{collector.name ?? "Unnamed"}</span>
                    <span className="text-xs text-zinc-500">Tier {collector.tier ?? "?"}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{collector.nextMove ?? "Define next move"}</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Due {formatRelative(collector.nextMoveDueAt)}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-zinc-400">No high-priority collector follow-ups identified. Verify data before outreach.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-300/30 bg-amber-500/5 p-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200">Woo-only buyers · needs verification</p>
              <p className="text-xs text-amber-200/80">Show First + Last Initial only</p>
            </div>
            <StatusChip label={`${wooNeedsVerification.length}`} tone="amber" />
          </header>
          <div className="mt-3 space-y-3">
            {wooNeedsVerification.length ? (
              wooNeedsVerification.map((collector) => (
                <article key={collector.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="text-sm font-semibold text-white">{formatWooName(collector.name)}</div>
                  <p className="mt-1 text-xs text-zinc-400">Last touch {formatRelative(collector.lastOutreachAt)}</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Verify identity before outreach.</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-amber-100">No Woo-only buyers surfaced in the latest import.</p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-4 text-xs text-zinc-400">
        Repeat-buyer detection requires historical Woo customer IDs or deduplicated order history. Current dataset only tracks collectors recorded in Supabase. Use this panel to verify data manually before contacting anyone.
      </div>
    </section>
  );
}

function isWooSource(source?: string | null) {
  return (source ?? "").toLowerCase().includes("woocommerce");
}

function sumBy<T>(items: T[], iteratee: (item: T) => number) {
  return items.reduce((sum, item) => sum + iteratee(item), 0);
}

function buildWarmFollowUps(collectors: CollectorRelationship[]) {
  const now = Date.now();
  return collectors
    .filter((collector) => {
      const tier = (collector.tier ?? "").trim().toUpperCase();
      const highTier = tier === "A" || tier === "B";
      if (!highTier) return false;
      const status = normalizeStatus(collector.status);
      const quiet = ["quiet", "dormant", "drift", "stalled", "risk"].some((keyword) => status.includes(keyword));
      const overdue = collector.nextMoveDueAt ? new Date(collector.nextMoveDueAt).getTime() < now : false;
      return quiet || overdue;
    })
    .slice(0, 4);
}

function buildBreakdown<T>(items: T[], iteratee: (item: T) => string) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = iteratee(item) || "Unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function recordToArray(record: Record<string, number>) {
  return Object.entries(record)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function normalizeStatus(status?: string | null) {
  if (!status) return "unknown";
  return status.toLowerCase();
}

function formatRelative(value: string | null | undefined) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86400000);
  return relativeFormatter.format(diffDays, "day");
}

function formatWooName(name?: string | null) {
  if (!name) return "Unverified buyer";
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "Buyer";
  const lastInitial = parts[1]?.[0];
  return lastInitial ? `${first} ${lastInitial}.` : `${first} (unverified)`;
}

function telemetryStatusTone(status?: CollectorTelemetrySnapshot["status"]) {
  if (status === "LIVE") return "emerald" as const;
  if (status === "PARTIAL") return "amber" as const;
  return "rose" as const;
}

type SummaryCardProps = {
  label: string;
  value: string;
  sublabel?: string | null;
};

function SummaryCard({ label, value, sublabel }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sublabel ? <p className="text-xs text-zinc-400">{sublabel}</p> : null}
    </div>
  );
}

type BreakdownCardProps = {
  title: string;
  items: Array<{ label: string; value: number }>;
  fallback: string;
};

function BreakdownCard({ title, items, fallback }: BreakdownCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{title}</p>
      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm text-zinc-200">
              <span>{item.label}</span>
              <span className="text-zinc-400">{numberFormatter.format(item.value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">{fallback}</p>
      )}
    </section>
  );
}

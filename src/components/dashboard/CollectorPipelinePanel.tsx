"use client";

import { PipelinePanel } from "@/lib/types/dashboard";
import { useMemo, useState } from "react";
import { CollectorInlineForm } from "./CollectorInlineForm";
import { OpportunityInlineActions } from "./OpportunityInlineActions";
import { EvidenceLinks } from "./EvidenceLinks";
import { PipelineHealthWidget } from "./PipelineHealthWidget";
import { CollectorDetailDrawer } from "./CollectorDetailDrawer";

type Props = { data: PipelinePanel };

export function CollectorPipelinePanel({ data }: Props) {
  const collectors = useMemo(() => data.collectors ?? [], [data.collectors]);
  const deals = useMemo(() => data.deals ?? [], [data.deals]);
  const [selectedCollectorId, setSelectedCollectorId] = useState<string | null>(null);

  const selectedCollector = useMemo(() => {
    if (!selectedCollectorId) return null;
    return collectors.find((collector) => collector.id === selectedCollectorId) ?? null;
  }, [collectors, selectedCollectorId]);

  const topCollectorValue = collectors.reduce((max, collector) => {
    const value = collector.estimatedValue ?? 0;
    return value > max ? value : max;
  }, 0);
  const totalCollectorValue = collectors.reduce((sum, collector) => sum + (collector.estimatedValue ?? 0), 0);

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <CollectorDetailDrawer
        open={Boolean(selectedCollector)}
        collector={selectedCollector}
        onClose={() => setSelectedCollectorId(null)}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:flex-wrap xl:flex-nowrap">
        <div className="flex-1 min-w-[320px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="ui-status-dot" data-tone="sky" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Collectors</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">Tier A / B</div>
                  <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">
                    Pipeline {totalCollectorValue != null ? formatCurrency(totalCollectorValue) : "—"}
                  </div>
                </div>
              </div>
            </div>
            <span className="text-xs text-zinc-500">{collectors.length} tracked</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <CollectorInlineForm />
            <PipelineHealthWidget data={data} />
          </div>
          <div className="ui-scroll-snap-x mt-4 flex gap-3 overflow-x-auto pb-2 md:block md:space-y-3 md:overflow-visible">
            {collectors.length === 0 && (
              <div className="ui-snap-item w-[86vw] min-w-[280px] rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500 md:w-auto md:min-w-0">
                Add Tier A/B collectors to see relationship status here.
              </div>
            )}
            {collectors.map((collector) => {
              const energy = getCollectorEnergy(collector.estimatedValue, topCollectorValue);
              const driftTone = getDriftTone((collector.status ?? "quiet").toLowerCase());

              return (
                <div
                  key={collector.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCollectorId(collector.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCollectorId(collector.id);
                    }
                  }}
                  className="ui-snap-item ui-glass-hover w-[86vw] min-w-[300px] max-w-[520px] shrink-0 cursor-pointer rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left ring-1 ring-inset ring-white/5 transition hover:border-white/15 focus:outline-none focus:ring-2 focus:ring-white/15 md:w-auto md:min-w-0 md:max-w-none"
                  aria-label={`Open collector ${collector.name}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-zinc-50">
                      {collector.name}
                    </div>
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-300">
                      Tier {collector.tier}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    <span>{collector.status ?? "quiet"}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] tracking-[0.3em]" data-energy={energy}>
                      {energy}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>Last touch {formatRelative(collector.lastOutreachAt)}</span>
                    <span className="font-semibold text-white/80">
                      {collector.estimatedValue != null ? formatCurrency(collector.estimatedValue) : "—"}
                    </span>
                  </div>
                  {collector.nextMove && (
                    <div className="mt-2 text-sm text-zinc-300">
                      Next: {collector.nextMove}
                      {collector.nextMoveDueAt ? ` • ${formatRelative(collector.nextMoveDueAt)}` : ""}
                    </div>
                  )}
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                      <span>Evidence</span>
                      <span className="text-[10px] font-semibold text-white/60">{driftTone}</span>
                    </div>
                    <EvidenceLinks
                      docs={collector.supportingDocs}
                      entityLabel="Collector"
                      entityName={collector.name}
                      entityId={collector.id}
                      ownerAgent={null}
                      max={3}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex-1 min-w-[320px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="ui-status-dot" data-tone="sky" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Licensing & deals</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">Pipeline moves</div>
                </div>
              </div>
            </div>
            <span className="text-xs text-zinc-500">{deals.length} active</span>
          </div>
          <div className="ui-scroll-snap-x mt-4 flex gap-3 overflow-x-auto pb-2 md:block md:space-y-3 md:overflow-visible">
            {deals.length === 0 && (
              <div className="ui-snap-item w-[86vw] min-w-[280px] rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500 md:w-auto md:min-w-0">
                No active deals tracked. Update the opportunity pipeline to populate this list.
              </div>
            )}
            {deals.map((deal) => (
              <div
                key={deal.id}
                className="ui-snap-item ui-glass-hover w-[86vw] min-w-[300px] max-w-[520px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:w-auto md:min-w-0 md:max-w-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-50">{deal.name}</div>
                    {deal.organization && <div className="mt-1 text-xs text-zinc-500">{deal.organization}</div>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      {deal.status.replace(/_/g, " ")}
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">
                      {deal.valueEstimate != null ? formatCurrency(deal.valueEstimate) : "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Next milestone</div>
                  <div className="mt-1 text-sm text-zinc-200">{deal.nextStep ?? "—"}</div>
                  <div className="mt-1 text-xs text-zinc-500">{formatDue(deal.nextStepDueAt)}</div>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Evidence</div>
                  <EvidenceLinks
                    docs={deal.supportingDocs}
                    entityLabel="Pipeline move"
                    entityName={deal.name}
                    entityId={deal.id}
                    ownerAgent={deal.ownerAgent}
                    max={3}
                  />
                </div>

                <OpportunityInlineActions opportunity={deal} variant="compact" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, "day");
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDue(iso: string | null) {
  const relative = formatRelative(iso);
  if (relative === "—") return "Due —";
  if (relative.includes("day")) return `Due ${relative}`;
  return `Due ${relative}`;
}

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getCollectorEnergy(value: number | null, topValue: number) {
  if (!value || !topValue) return "LOW";
  const ratio = value / topValue;
  if (ratio >= 0.75) return "HIGH";
  if (ratio >= 0.35) return "MED";
  return "LOW";
}

function getDriftTone(status: string) {
  if (status.includes("risk") || status.includes("drift")) return "drift";
  if (status.includes("warm") || status.includes("active")) return "active";
  return "quiet";
}

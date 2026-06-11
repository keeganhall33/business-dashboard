import type { PipelinePanel } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";

type Props = {
  data: PipelinePanel;
};

export function PipelineHealthWidget({ data }: Props) {
  const collectors = data.collectors ?? [];
  const deals = data.deals ?? [];

  const collectorValue = collectors.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0);
  const dealValue = deals.reduce((sum, deal) => sum + (deal.valueEstimate ?? 0), 0);
  const atRiskCollectors = collectors.filter((c) => (c.status ?? "").toLowerCase().includes("risk") || (c.status ?? "").toLowerCase().includes("drift"));
  const today = new Date();
  const staleCollectors = collectors.filter((collector) => isStale(collector.lastOutreachAt, today, 60));

  const dueSoonDeals = deals.filter((deal) => isWithinDays(deal.nextStepDueAt, today, 7));
  const overdueDeals = deals.filter((deal) => isOverdue(deal.nextStepDueAt, today));
  const pipelineEmpty = collectors.length === 0 && deals.length === 0;

  const tone = overdueDeals.length > 0
    ? "rose"
    : dueSoonDeals.length > 0 || atRiskCollectors.length > 0 || staleCollectors.length > 0 || pipelineEmpty
      ? "amber"
      : "emerald";

  const headline = (() => {
    if (overdueDeals.length > 0) return `${overdueDeals.length} overdue`;
    if (dueSoonDeals.length > 0) return `${dueSoonDeals.length} due ≤7d`;
    if (staleCollectors.length > 0) return `${staleCollectors.length} stale`;
    if (pipelineEmpty) return "pipeline empty";
    return "green";
  })();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">Pipeline health</div>
          <div className="mt-2 text-2xl font-semibold text-white">{headline}</div>
        </div>
        <StatusChip label={tone === "emerald" ? "on-track" : tone === "amber" ? "attention" : "at-risk"} tone={tone} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Collectors" value={collectors.length} />
        <Stat label="Deals" value={deals.length} />
        <Stat label="Value" value={formatCurrency(collectorValue + dealValue)} align="right" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {overdueDeals.length ? <StatusChip label={`${overdueDeals.length} overdue`} tone="rose" /> : null}
        {dueSoonDeals.length ? <StatusChip label={`${dueSoonDeals.length} due ≤ 7d`} tone="amber" /> : null}
        {atRiskCollectors.length ? <StatusChip label={`${atRiskCollectors.length} drifting`} tone="amber" /> : null}
        {staleCollectors.length ? <StatusChip label={`${staleCollectors.length} stale`} tone="amber" /> : null}
        {pipelineEmpty ? <StatusChip label="pipeline empty" tone="rose" /> : null}
        {!overdueDeals.length && !dueSoonDeals.length && !atRiskCollectors.length && !staleCollectors.length && !pipelineEmpty ? (
          <StatusChip label="no fires" tone="emerald" />
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, align = "left" }: { label: string; value: string | number; align?: "left" | "right" }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2 ${align === "right" ? "text-right" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function isWithinDays(iso: string | null | undefined, today: Date, days: number) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= days;
}

function isOverdue(iso: string | null | undefined, today: Date) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < today.getTime() - 86400000 * 0.5;
}

function isStale(iso: string | null | undefined, today: Date, days: number) {
  if (!iso) return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  return diffDays > days;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

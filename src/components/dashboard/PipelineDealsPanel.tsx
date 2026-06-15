import { EvidenceLinks } from "./EvidenceLinks";
import { StatusChip } from "./ui/StatusChip";
import type { PipelinePanel } from "@/lib/types/dashboard";

type Deal = PipelinePanel["deals"][number];

type Props = {
  deals: Deal[];
};

export function PipelineDealsPanel({ deals }: Props) {
  if (!deals.length) {
    return (
      <section className="ui-glass ui-glass-hover rounded-3xl border border-white/10 bg-white/[0.02] p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Pipeline deals</div>
        <p className="mt-2 text-sm text-zinc-300">No recent licensing, partnership, or institutional opportunities were found. Log opportunities in Supabase to populate this view.</p>
      </section>
    );
  }

  return (
    <section className="ui-glass ui-glass-hover space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Pipeline deals</div>
          <p className="mt-1 text-sm text-zinc-400">Live opportunities from Supabase `opportunity_pipeline`.</p>
        </div>
        <StatusChip label={`${deals.length} active`} tone="sky" />
      </div>

      <div className="ui-scroll-snap-x flex gap-3 overflow-x-auto pb-2 md:block md:space-y-3 md:overflow-visible">
        {deals.map((deal) => (
          <article
            key={deal.id}
            className="ui-snap-item ui-glass-hover w-[86vw] min-w-[300px] max-w-[520px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:w-auto md:min-w-0 md:max-w-none"
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-50">{deal.name}</div>
                {deal.organization && <div className="mt-1 text-xs text-zinc-500">{deal.organization}</div>}
                <div className="mt-1 text-[11px] uppercase tracking-[0.26em] text-zinc-500">{deal.opportunityType.replace(/_/g, " ")}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {deal.status.replace(/_/g, " ")}
                </span>
                <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">
                  {deal.valueEstimate != null ? formatCurrency(deal.valueEstimate) : "—"}
                </span>
              </div>
            </header>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Next milestone</div>
              <div className="mt-1 text-sm text-zinc-200">{deal.nextStep ?? "—"}</div>
              <div className="mt-1 text-xs text-zinc-500">{formatDue(deal.nextStepDueAt)}</div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Evidence</div>
              <EvidenceLinks
                docs={deal.supportingDocs}
                entityLabel="Deal"
                entityName={deal.name}
                entityId={deal.id}
                ownerAgent={deal.ownerAgent}
                max={4}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDue(iso: string | null) {
  if (!iso) return "Date TBD";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

import { PipelinePanel } from "@/lib/types/dashboard";
import { CollectorInlineForm } from "./CollectorInlineForm";

type Props = { data: PipelinePanel };

export function CollectorPipelinePanel({ data }: Props) {
  const collectors = data.collectors ?? [];
  const deals = data.deals ?? [];

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/95 p-6">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Collectors</div>
              <div className="text-lg font-semibold text-zinc-100">Tier A / B</div>
            </div>
            <span className="text-xs text-zinc-500">{collectors.length} tracked</span>
          </div>
          <CollectorInlineForm />
          <div className="mt-4 space-y-3">
            {collectors.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">Add Tier A/B collectors to see relationship status here.</div>}
            {collectors.map((collector) => (
              <div key={collector.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-50">{collector.name}</div>
                  <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs uppercase tracking-wide text-zinc-300">Tier {collector.tier}</span>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">{collector.status ?? "quiet"}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>Last touch {formatRelative(collector.lastOutreachAt)}</span>
                  <span>{collector.estimatedValue != null ? formatCurrency(collector.estimatedValue) : "—"}</span>
                </div>
                {collector.nextMove && (
                  <div className="mt-2 text-sm text-zinc-300">Next: {collector.nextMove}{collector.nextMoveDueAt ? ` • ${formatRelative(collector.nextMoveDueAt)}` : ""}</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Licensing & deals</div>
              <div className="text-lg font-semibold text-zinc-100">Pipeline moves</div>
            </div>
            <span className="text-xs text-zinc-500">{deals.length} active</span>
          </div>
          <div className="mt-4 space-y-3">
            {deals.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">No active deals tracked. Update the opportunity pipeline to populate this list.</div>}
            {deals.map((deal) => (
              <div key={deal.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between text-sm font-semibold text-zinc-50">
                  <span>{deal.name}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{deal.status}</span>
                </div>
                {deal.organization && <div className="text-xs text-zinc-500">{deal.organization}</div>}
                <div className="mt-2 text-sm text-zinc-300">Next: {deal.nextStep ?? "—"}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>Due {formatRelative(deal.nextStepDueAt)}</span>
                  <span>{deal.valueEstimate != null ? formatCurrency(deal.valueEstimate) : "—"}</span>
                </div>
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

function formatCurrency(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

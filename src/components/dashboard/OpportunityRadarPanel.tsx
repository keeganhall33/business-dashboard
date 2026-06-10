import { OpportunityRadar } from "@/lib/types/dashboard";
import { OpportunityInlineActions } from "./OpportunityInlineActions";
import { EvidenceLinks } from "./EvidenceLinks";
import { EmptyState } from "./ui/EmptyState";

type Props = {
  data: OpportunityRadar;
};

export function OpportunityRadarPanel({ data }: Props) {
  const topOpportunities = dedupeOpportunities(data.topOpportunities);
  const hasOpportunities = topOpportunities.length > 0;
  const hasMoves = data.nextFiveMoves.length > 0;

  return (
    <section className="ui-glass ui-glass-hover rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="ui-status-dot" data-tone="sky" />
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Opportunity Radar</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.activeCount}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-sm text-zinc-400">Ready for Outreach</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.readyForOutreachCount}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Top Opportunities</div>
        {hasOpportunities ? (
          <div className="ui-scroll-snap-x mt-3 flex gap-3 overflow-x-auto pb-2 md:block md:space-y-3 md:overflow-visible">
            {topOpportunities.map((item) => (
              <div
                key={item.id}
                className="ui-snap-item ui-glass-hover w-[86vw] min-w-[300px] max-w-[520px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:w-auto md:min-w-0 md:max-w-none"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-50">{item.name}</div>
                    <div className="mt-1 text-sm text-zinc-400">{item.organization ?? "Independent"}</div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      {item.opportunityType.replace(/_/g, " ")}
                    </span>
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      {item.status.replace(/_/g, " ")}
                    </span>
                    <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300">
                      ${item.valueEstimate ?? "—"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Next milestone</div>
                    <div className="mt-1 text-sm text-zinc-200">{item.nextStep ?? "—"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatRelative(item.nextStepDueAt)}</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Evidence</div>
                    <EvidenceLinks
                      docs={item.supportingDocs}
                      entityLabel="Opportunity"
                      entityName={item.name}
                      entityId={item.id}
                      ownerAgent={item.ownerAgent}
                      max={3}
                    />
                  </div>
                </div>

                <OpportunityInlineActions opportunity={item} variant="compact" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState title="No tracked opportunities" detail="Add active deals to see them ranked here." />
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Next Five Moves</div>
        {hasMoves ? (
          <ul className="mt-2 space-y-2 text-sm text-zinc-100">
            {data.nextFiveMoves.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyState title="No upcoming moves" detail="Document next actions to surface them here." />
          </div>
        )}
      </div>
    </section>
  );
}

function formatRelative(iso: string | null) {
  if (!iso) return "Due —";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Due —";
  const diffDays = Math.round((date.getTime() - Date.now()) / 86400000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) < 14) {
    return `Due ${formatter.format(diffDays, "day")}`;
  }
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function dedupeOpportunities<T extends { name: string; organization: string | null }>(items: T[]) {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const key = `${item.name}|${item.organization ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 5) break;
  }
  return unique;
}

import { OpportunityRadar } from "@/lib/types/dashboard";

type Props = {
  data: OpportunityRadar;
};

export function OpportunityRadarPanel({ data }: Props) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Opportunity Radar</div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Active</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.activeCount}</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 p-4">
          <div className="text-sm text-zinc-400">Ready for Outreach</div>
          <div className="mt-2 text-3xl font-semibold text-zinc-50">{data.readyForOutreachCount}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Top Opportunities</div>
        <div className="mt-3 space-y-3">
          {data.topOpportunities.map((item) => (
            <div key={item.id} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm font-medium text-zinc-50">{item.name}</div>
              <div className="mt-1 text-sm text-zinc-400">{item.organization ?? "Independent"}</div>
              <div className="mt-2 text-xs text-zinc-500">
                {item.status} • Prestige {item.prestigeScore ?? "—"} • Value ${item.valueEstimate ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm text-zinc-400">Next Five Moves</div>
        <ul className="mt-2 space-y-2 text-sm text-zinc-100">
          {data.nextFiveMoves.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}


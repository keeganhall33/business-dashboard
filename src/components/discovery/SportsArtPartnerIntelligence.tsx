import { SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1 } from "@/lib/discovery/sports-art-partners/fixtures";
import { toSportsArtPartnerDashboardV1 } from "@/lib/discovery/sports-art-partners/dashboard";

export function SportsArtPartnerIntelligence() {
  const dashboard = toSportsArtPartnerDashboardV1(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1);

  return (
    <main className="space-y-5">
      <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Discovery intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-stone-950">Sports Art Partner Intelligence</h1>
        <p className="mt-3 max-w-4xl text-base leading-7 text-stone-700">
          Unified partner and benchmark universe for sports-art strategy. Benchmark companies are separated from true partner targets, and UNKNOWN evidence stays visible.
        </p>
      </header>

      <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm" aria-label="Sports art partner filters">
        <h2 className="text-lg font-semibold text-stone-950">Filters</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {dashboard.filters.map((filter) => (
            <span key={filter} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
              {filter}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-label="Sports art partner comparison">
        {dashboard.rows.map((row) => (
          <article key={row.company_id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">{row.company_name}</h2>
                <p className="mt-1 text-sm font-semibold text-stone-600">{row.primary_classification}</p>
              </div>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-semibold text-stone-700">
                Keegan action required: {row.keegan_action_required}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Relationship" value={row.relationship_strength} />
              <Metric label="Licensing power" value={row.licensing_power} />
              <Metric label="Distribution reach" value={row.distribution_reach} />
              <Metric label="Athlete / league access" value={row.athlete_league_access} />
              <Metric label="Strategic upside" value={row.strategic_upside} />
              <Metric label="Economics" value={row.economic_attractiveness} />
              <Metric label="Competitive overlap" value={row.competitive_overlap} />
              <Metric label="Current opportunity" value={row.current_opportunity} />
            </dl>
            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Existing access path</div>
              <p className="mt-1 text-sm leading-6 text-stone-700">{row.existing_access_path || "UNKNOWN"}</p>
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Next action</div>
              <p className="mt-1 text-sm leading-6 text-stone-700">{row.next_action}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-[#fffdf8] p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-stone-900">{value}</dd>
    </div>
  );
}

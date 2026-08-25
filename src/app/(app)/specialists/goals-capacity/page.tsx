import Link from "next/link";
import { getSpecialistCommandCenterCardsV1 } from "@/lib/executive-home/specialist-command-center";
import { getGoalsPortfolioCapacityFixtureBundleV1 } from "@/lib/goals-portfolio-capacity/fixtures";
import { toExecutiveGoalsCapacityViewModelsV1 } from "@/lib/goals-portfolio-capacity/executive-view-model";

export default function GoalsCapacitySpecialistPage() {
  const card = getSpecialistCommandCenterCardsV1().find((item) => item.id === "goals-capacity");
  const views = toExecutiveGoalsCapacityViewModelsV1(getGoalsPortfolioCapacityFixtureBundleV1().snapshots);

  return (
    <main className="space-y-5">
      <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Specialist drill-down</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-stone-950">Goals / Capacity</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">
          Read-only portfolio pressure surface. Capacity conflicts remain visible before new commitments are ranked.
        </p>
      </header>

      {card ? (
        <section className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-950">Command-center summary</h2>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            <Detail label="WHAT_CHANGED" value={card.what_changed} />
            <Detail label="WHY_IT_MATTERS" value={card.why_it_matters} />
            <Detail label="NEXT_BEST_ACTION" value={card.next_best_action} />
            <Detail label="Gap / risk" value={card.material_gap_or_risk} />
          </dl>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-3">
        {views.map((view) => (
          <article key={view.snapshot_id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{view.portfolio_state}</div>
            <h2 className="mt-2 text-base font-semibold text-stone-950">{view.headline}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-700">{view.overload_or_conflict.summary}</p>
            <p className="mt-3 text-sm font-semibold text-stone-900">{view.next_portfolio_action}</p>
          </article>
        ))}
      </section>

      <Link href="/executive-home" className="inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
        Back to command center
      </Link>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-stone-700">{value}</dd>
    </div>
  );
}

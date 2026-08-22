import type { ResponsiveShellFixtureV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import { AskJeevesControl } from "./AskJeevesControl";
import { DecisionRoom } from "./DecisionRoom";

export function ResponsiveExecutiveShell({ data }: { data: ResponsiveShellFixtureV1 }) {
  const decision = data.decision_rooms[0];
  const nav = [...data.nav.filter((item) => item.priority === "primary"), ...data.nav.filter((item) => item.priority !== "primary")];

  return (
    <main className="min-h-screen bg-[#f7f2ea] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col md:grid md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-stone-200 bg-[#fbf8f1]/95 px-4 py-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r md:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jeeves OS</p>
          <h1 className="mt-2 text-xl font-semibold tracking-normal text-stone-950">Executive Home</h1>
          <nav aria-label="Executive workspace navigation" className="mt-5 flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {nav.map((item) => <a key={item.id} href={item.id === "decision-rooms" ? `#${decision.decision_id}` : `#${item.id}`} className="whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm md:rounded-xl md:shadow-none" title={item.purpose}><span className="md:hidden">{item.compactLabel}</span><span className="hidden md:inline">{item.label}</span></a>)}
          </nav>
          <div className="mt-5 hidden md:block"><AskJeevesControl control={data.global_ask} compact /></div>
        </aside>
        <div className="min-w-0 px-4 py-5 md:px-8 md:py-8">
          <section id="home" className="mx-auto max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Morning briefing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal text-stone-950 md:text-5xl">{data.home.title}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_300px]">
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm md:p-5"><h3 className="text-sm font-semibold text-stone-950">Change scan</h3><div className="mt-3 grid gap-2">{data.home.changed_since_last_review.map((item, index) => <div key={item} className="flex gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-xs font-semibold text-stone-800">{index + 1}</span><p className="text-sm leading-6 text-stone-700">{item}</p></div>)}</div></div>
              <div className="md:hidden"><AskJeevesControl control={data.global_ask} compact /></div>
              <div className="hidden rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:block"><h3 className="text-sm font-semibold text-stone-950">Desktop focus</h3><p className="mt-2 text-sm leading-6 text-stone-700">{data.responsive_behavior.desktop[0]}</p></div>
            </div>
            <div className="mt-5 grid gap-4">{data.home.priority_cards.map((card) => <article key={card.id} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Strategy recommendation</p><h3 className="mt-2 text-xl font-semibold tracking-normal text-stone-950">{card.label}</h3><p className="mt-2 text-sm leading-6 text-stone-700">{card.summary}</p></div><a href={`#${card.decision_room_id}`} className="inline-flex justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm">{card.next_step_label}</a></div></article>)}</div>
          </section>
          <section id="strategy" className="mx-auto mt-8 max-w-4xl rounded-3xl border border-stone-200 bg-[#fffdf8] p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Progressive disclosure</p><p className="mt-2 text-sm leading-6 text-stone-700">Summary moves to explanation, evidence, specialist analysis, and then the full Decision Room without crowding Home.</p></section>
          <div className="mx-auto mt-8 max-w-6xl"><DecisionRoom decision={decision} /></div>
          <section className="mx-auto mt-8 grid max-w-6xl gap-3 md:grid-cols-2">
            <ResponsiveBehaviorPanel label="Mobile behavior" items={data.responsive_behavior.mobile} />
            <ResponsiveBehaviorPanel label="Desktop behavior" items={data.responsive_behavior.desktop} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ResponsiveBehaviorPanel({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-stone-950">{label}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item, index) => (
          <div key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl bg-stone-50 p-3">
            <div className="mt-1 h-full w-2 rounded-full bg-stone-300" aria-hidden="true" />
            <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Step {index + 1}</div><p className="mt-1 text-sm leading-6 text-stone-700">{item}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

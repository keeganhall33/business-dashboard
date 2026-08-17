import type { CreativeDirectionWorkspaceFixtureV1 } from "@/lib/creative-direction/dashboard-refresh-fixtures";
import { CreativeVisualizationPanel } from "@/components/creative-visualization/CreativeVisualizationPanel";
import { CREATIVE_VISUALIZATION_COMPARISON_SET_FIXTURE_V1 } from "@/lib/creative-visualization/fixtures";

export function CreativeDirectionWorkspace({ data }: { data: CreativeDirectionWorkspaceFixtureV1 }) {
  const rec = data.current_recommendation;
  const stages = ["KEEP_NOW", "TEST_NOW", "DEVELOP_NEXT", "DEFER", "AVOID"] as const;

  return (
    <main className="min-h-screen bg-[#f7f2ea] px-4 py-6 text-stone-950 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Creative Direction Intelligence</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal md:text-5xl">What should I make next?</h1>
          <p className="mt-4 text-base leading-7 text-stone-700">{rec.what_should_i_make_next}</p>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Current creative recommendation</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-normal">{rec.recommendation}</h2>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">{rec.stage}</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {stages.map((stage) => (
                <div key={stage} className={`rounded-2xl border p-3 text-sm ${stage === rec.stage ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-stone-50 text-stone-700"}`}>
                  {stage.replace("_", " / ")}
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <InfoBlock title="Medium portfolio" items={rec.medium_portfolio} />
              <InfoBlock title="Specific artwork / series recommendations" items={rec.artwork_series_recommendations} />
              <InfoBlock title="Composition / palette / scale / material / style detail" items={rec.composition_palette_scale_material_style} />
              <InfoBlock title="What to stop / avoid" items={rec.what_to_stop_avoid} />
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Short path to goal</h3>
              <p className="mt-3 text-sm leading-6 text-stone-800">{rec.short_path_to_goal}</p>
            </article>
            <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Why this changed</h3>
              <p className="mt-3 text-sm leading-6 text-stone-800">{rec.why_changed ?? "No material change in this version."}</p>
            </article>
          </aside>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <InfoBlock title="Market signals" items={data.market_signals} />
          <InfoBlock title="Institutional signals" items={data.institutional_signals} />
          <InfoBlock title="Collector signals" items={data.collector_signals} />
          <InfoBlock title="Peer / category map" items={data.peer_category_map} />
          <InfoBlock title="Open visual territory" items={data.open_visual_territory} />
          <InfoBlock title="Creative experiments" items={data.creative_experiments} />
          <InfoBlock title="Creative learnings" items={data.creative_learnings} />
        </section>

        <CreativeVisualizationPanel comparisonSet={CREATIVE_VISUALIZATION_COMPARISON_SET_FIXTURE_V1} />

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Refresh cadence</h2>
            <div className="mt-4 space-y-3">
              {data.refresh_states.map((state) => (
                <div key={state.cadence} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong>{state.cadence}</strong><span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-stone-700">{state.status}</span></div>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{state.trigger}</p>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Recommendation version history</h2>
            <div className="mt-4 space-y-3">
              {data.version_history.map((version) => (
                <div key={version.version} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="text-sm font-semibold">RecommendationVersion {version.version} · {version.stage} · confidence {version.confidence}</div>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{version.why_changed ?? version.recommendation}</p>
                  {version.new_evidence_ids.length > 0 && <p className="mt-2 text-xs text-stone-500">NEW_EVIDENCE: {version.new_evidence_ids.join(", ")}</p>}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-800">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

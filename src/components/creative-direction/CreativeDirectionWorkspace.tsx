import type { CreativeDirectionWorkspaceFixtureV1 } from "@/lib/creative-direction/dashboard-refresh-fixtures";
import type { CreativeConceptComparisonV1, CreativeVisualizationRequestV1 } from "@/lib/creative-direction/visualization-fixtures";

export function CreativeDirectionWorkspace({
  data,
  visualization
}: {
  data: CreativeDirectionWorkspaceFixtureV1;
  visualization?: {
    request: CreativeVisualizationRequestV1;
    comparison: CreativeConceptComparisonV1;
  };
}) {
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

        {visualization && (
          <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{visualization.request.ACTION_LABEL}</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-normal">Creative visualization concept studies</h2>
                <p className="mt-3 text-sm leading-6 text-stone-700">{visualization.request.visualization_goal}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                Generated concepts are not market evidence.
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {visualization.request.concepts.map((concept) => (
                <article key={concept.CONCEPT_ID} className="flex min-h-full flex-col rounded-2xl border border-stone-200 bg-[#fffdf8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{concept.CONCEPT_ID}</h3>
                    <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700">{concept.KEEGAN_FEEDBACK.state}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-stone-700">{concept.STRATEGIC_HYPOTHESIS}</p>
                  <dl className="mt-4 space-y-3 text-sm">
                    <ConceptDetail label="Composition" value={concept.COMPOSITION_SPEC} />
                    <ConceptDetail label="Subject" value={concept.SUBJECT_SPEC} />
                    <ConceptDetail label="Palette" value={concept.PALETTE_SPEC} />
                    <ConceptDetail label="Lighting" value={concept.LIGHTING_SPEC} />
                    <ConceptDetail label="Transformation" value={concept.TRANSFORMATION_MECHANISM} />
                    <ConceptDetail label="Depth / relief" value={concept["PHYSICAL_DEPTH/RELIEF_SPEC"]} />
                  </dl>
                  <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Controlled variables</p>
                    <p className="mt-2 text-sm leading-6 text-stone-800">{concept.CONTROLLED_VARIABLES.join(", ")}</p>
                  </div>
                  <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Prompt spec</p>
                    <p className="mt-2 text-xs leading-5 text-stone-700">{concept.GENERATION_PROMPT_SPEC}</p>
                  </div>
                  <div className="mt-auto pt-4 text-xs leading-5 text-stone-600">
                    Lineage: v{concept.LINEAGE.version}{concept.LINEAGE.parent_concept_id ? ` from ${concept.LINEAGE.parent_concept_id}` : " original"} · Evidence refs: {concept.MARKET_EVIDENCE_REFERENCES.join(", ")}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <InfoBlock title="Side-by-side comparison" items={visualization.comparison.isolate_variable_options.map((variable) => `${variable}: ${(visualization.request.concepts.filter((concept) => concept.CONTROLLED_VARIABLES.includes(variable)).map((concept) => concept.CONCEPT_ID).join(", ") || "not varied")}`)} />
              <InfoBlock title="Pin / favorite / reject" items={[`Pinned: ${visualization.comparison.pinned_concept_ids.join(", ")}`, `Rejected: ${visualization.comparison.rejected_concept_ids.join(", ")}`, "Voice/text annotations are HUMAN_REPORTED preference context only."]} />
              <InfoBlock title="More like this / less like this" items={[visualization.comparison.next_regeneration_request.instruction, `Isolate one variable and regenerate: ${visualization.comparison.next_regeneration_request.isolate_variable}`, "Compare concept to strategic recommendation/evidence without changing confidence."]} />
            </div>
          </section>
        )}

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

function ConceptDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</dt>
      <dd className="mt-1 leading-6 text-stone-800">{value}</dd>
    </div>
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

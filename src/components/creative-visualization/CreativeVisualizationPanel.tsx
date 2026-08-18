import type { CreativeVisualizationComparisonSetV1, CreativeVisualizationConceptV1 } from "@/lib/creative-visualization/contracts";

const statusTone: Record<CreativeVisualizationConceptV1["VISUALIZATION_STATUS"], string> = {
  READY_FOR_REVIEW: "border-stone-300 bg-white text-stone-800",
  PINNED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-900",
  NEEDS_ITERATION: "border-amber-200 bg-amber-50 text-amber-900"
};

export function CreativeVisualizationPanel({ comparisonSet }: { comparisonSet: CreativeVisualizationComparisonSetV1 }) {
  return (
    <section className="mt-6 rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Creative visualization</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal">Visualize this recommendation</h2>
          <p className="mt-3 text-sm leading-6 text-stone-700">{comparisonSet.epistemic_guardrail}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
          <div className="font-semibold text-stone-950">{comparisonSet.request.concept_count} concept studies</div>
          <div className="mt-1">{comparisonSet.request.parent_recommendation_version}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {comparisonSet.dashboard_actions.map((action) => (
          <span key={action} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
            {action.replaceAll("_", " / ")}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        {comparisonSet.concepts.map((concept) => (
          <ConceptCard key={concept.CONCEPT_ID} concept={concept} />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Controlled-variable comparison</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {comparisonSet.comparison_axes.map((axis) => (
              <div key={axis} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800">
                {axis}
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">Evidence boundary</h3>
          <p className="mt-3 text-sm leading-6 text-stone-800">
            Market references are comparison context only: {comparisonSet.request.evidence_references.join(", ")}.
          </p>
          <p className="mt-3 rounded-xl bg-stone-950 px-3 py-2 text-xs font-semibold text-white">
            {comparisonSet.request.confidence_change_policy.replaceAll("_", " ")}
          </p>
        </article>
      </div>
    </section>
  );
}

function ConceptCard({ concept }: { concept: CreativeVisualizationConceptV1 }) {
  return (
    <article className="flex min-h-[560px] flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{concept.CONCEPT_ID}</p>
          <h3 className="mt-2 text-lg font-semibold tracking-normal">{concept.MEDIUM}</h3>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone[concept.VISUALIZATION_STATUS]}`}>
          {concept.VISUALIZATION_STATUS.replaceAll("_", " ")}
        </span>
      </div>

      <div className="mt-4 aspect-[4/3] rounded-xl border border-stone-200 bg-[linear-gradient(135deg,#f8f4ec,#ddd5c8)] p-4">
        <div className="h-full rounded-lg border border-stone-300 bg-white/55 p-3 text-xs leading-5 text-stone-700">
          <div className="font-semibold text-stone-950">{concept["DIMENSIONS/ASPECT"]}</div>
          <div className="mt-2">{concept.COMPOSITION_SPEC}</div>
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-sm leading-6 text-stone-800">
        <Spec label="Subject" value={concept.SUBJECT_SPEC} />
        <Spec label="Palette" value={concept.PALETTE_SPEC} />
        <Spec label="Lighting" value={concept.LIGHTING_SPEC} />
        <Spec label="Transformation" value={concept.TRANSFORMATION_MECHANISM} />
      </dl>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Controlled variables</h4>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-stone-800">
          {concept.CONTROLLED_VARIABLES.map((item) => (
            <li key={`${concept.CONCEPT_ID}-${item.variable}`} className="rounded-xl bg-stone-50 p-2">
              <strong>{item.variable}:</strong> {item.variant}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-4">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-800">
          <strong>Feedback:</strong> {concept.KEEGAN_FEEDBACK.state.replaceAll("_", " ")}
          {concept.KEEGAN_FEEDBACK.note ? ` - ${concept.KEEGAN_FEEDBACK.note}` : ""}
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-500">{concept.WHAT_THIS_VISUAL_DOES_NOT_PROVE.join(" ")}</p>
      </div>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

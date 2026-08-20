import type { DecisionConversationViewModelV1 } from "./DecisionConversationViewModel";
import { buildDecisionConversationPanelViewModelV1 } from "./DecisionConversationViewModel";

function StatusPill({ label, tone = "stone" }: { label: string; tone?: "stone" | "amber" | "emerald" | "sky" | "rose" }) {
  const tones = {
    stone: "border-stone-300 bg-stone-50 text-stone-800",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-800",
    sky: "border-sky-300 bg-sky-50 text-sky-800",
    rose: "border-rose-300 bg-rose-50 text-rose-800"
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</span>;
}

function truthTone(truthState: string) {
  if (truthState === "KNOWN") return "emerald" as const;
  if (truthState === "UNKNOWN" || truthState === "ASSUMED" || truthState === "HYPOTHETICAL_ONLY") return "amber" as const;
  if (truthState === "CONFLICTED") return "rose" as const;
  return "stone" as const;
}

export function DecisionConversationPanel({
  viewModel = buildDecisionConversationPanelViewModelV1()
}: {
  viewModel?: DecisionConversationViewModelV1;
}) {
  return (
    <section id={viewModel.id} aria-label="Conversational decision panel" className="border border-stone-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{viewModel.eyebrow}</p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-stone-950 md:text-2xl">{viewModel.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">{viewModel.strategic_question}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={viewModel.read_only_state} tone="amber" />
          <StatusPill label={viewModel.mutation_state} tone="stone" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <article className="border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap gap-2">
              <StatusPill label={`Version ${viewModel.recommendation.version}`} tone="sky" />
              <StatusPill label={viewModel.recommendation.approval_level} tone="stone" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-stone-950">{viewModel.recommendation.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">{viewModel.recommendation.summary}</p>
            <p className="mt-3 text-sm font-semibold text-stone-950">{viewModel.recommendation.action}</p>
          </article>

          <form className="border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor={`${viewModel.id}-input`} className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                ASK ABOUT THIS DECISION
              </label>
              <div className="flex items-center gap-2">
                <button type="button" aria-pressed={viewModel.input.mode === "VOICE_TRANSCRIPT"} title={viewModel.voice.affordance_label} className="h-9 w-9 rounded-full border border-stone-300 bg-stone-950 text-xs font-semibold text-white">
                  Mic
                </button>
                <StatusPill label={viewModel.voice.state_label} tone={viewModel.input.mode === "VOICE_TRANSCRIPT" ? "emerald" : "stone"} />
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                id={`${viewModel.id}-input`}
                aria-label="Ask about this decision"
                className="min-w-0 flex-1 border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-950 outline-none"
                value={viewModel.input.utterance}
                readOnly
              />
              <button type="button" className="border border-stone-950 bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
                Ask
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-600">
              Canonical payload: {viewModel.input.classification} / {viewModel.input.mode} / read_only_fixture={String(viewModel.input.read_only_fixture)}
            </p>
          </form>

          <article className="border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Grounded answer</p>
            <p className="mt-2 text-sm leading-6 text-stone-900">{viewModel.answer.written_answer}</p>
            <p className="mt-3 text-sm leading-6 text-stone-700"><strong className="text-stone-950">Spoken:</strong> {viewModel.answer.spoken_answer}</p>
          </article>
        </div>

        <aside className="space-y-4">
          <section className="border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-stone-950">Suggested next questions</h3>
            <div className="mt-3 grid gap-2">
              {viewModel.suggested_questions.map((question) => (
                <button key={question.id} type="button" className="border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm font-semibold text-stone-800">
                  {question.label}
                </button>
              ))}
            </div>
          </section>

          <section className="border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-stone-950">Evidence</h3>
            <div className="mt-3 space-y-2">
              {viewModel.answer.evidence_refs.map((item) => (
                <div key={item.id} className="border border-stone-200 bg-stone-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-950">{item.label}</span>
                    <StatusPill label={item.truth_state} tone={truthTone(item.truth_state)} />
                  </div>
                  <p className="mt-2 leading-6 text-stone-700">{item.provenance} | {item.source}</p>
                  <p className="mt-1 leading-6 text-stone-700">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-stone-950">Assumptions / unknowns</h3>
            <div className="mt-3 space-y-2">
              {viewModel.answer.assumptions.map((item) => (
                <div key={item.id} className="border border-stone-200 bg-stone-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-stone-950">{item.label}</span>
                    <StatusPill label={item.state} tone={item.state === "CONFIRMED" ? "emerald" : "amber"} />
                  </div>
                  <p className="mt-2 leading-6 text-stone-700">{item.detail}</p>
                </div>
              ))}
              {viewModel.answer.unknowns.map((item) => (
                <div key={item} className="border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  UNKNOWN: {item}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

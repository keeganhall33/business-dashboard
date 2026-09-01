import type { AskJeevesControlV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

export function AskJeevesControl({ control, compact = false }: { control: AskJeevesControlV1; compact?: boolean }) {
  const voiceLabel = control.voice_state === "LISTENING_MOCK" ? "Mock mic listening" : control.voice_state === "TRANSCRIPT_READY" ? "Transcript ready" : control.voice_state === "DISABLED_UNSUPPORTED" ? "Mic unsupported" : "Start voice";

  return (
    <section id={control.id} aria-label={control.scope === "GLOBAL" ? "Global Ask Jeeves" : "Contextual Ask Jeeves"} className="rounded-2xl border border-stone-200 bg-white/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Ask Jeeves</div>
          {!compact && <div className="mt-1 text-sm text-stone-700">{control.placeholder}</div>}
        </div>
        <button type="button" aria-pressed={control.voice_state === "LISTENING_MOCK"} className="h-10 w-10 rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 shadow-sm" title={voiceLabel}>
          Mic
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <input aria-label={control.placeholder} className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-950 outline-none" defaultValue={control.transcript} placeholder={control.placeholder} readOnly />
        <button type="button" className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-900 shadow-sm">Ask</button>
      </div>
      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Voice and text share the same canonical pipeline. Ambiguous statements are not written to memory without classification.</div>
      {!compact && (
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Spoken answer</div><p className="mt-1 text-stone-800">{control.spoken_answer}</p></div>
          <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Written answer</div><p className="mt-1 text-stone-900">{control.written_answer}</p></div>
        </div>
      )}
    </section>
  );
}

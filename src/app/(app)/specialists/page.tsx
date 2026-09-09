import { getSpecialistCapabilityStatusV1 } from "@/lib/executive-home/specialist-command-center";

const truthStyles = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
} as const;

export default function SpecialistsPage() {
  const capabilities = getSpecialistCapabilityStatusV1();

  return (
    <main className="min-h-screen bg-[#f8f4ec] text-stone-950" aria-label="Specialist intelligence workspace">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Production truth boundary</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">Specialists</h1>
              <p className="mt-3 text-sm leading-6 text-stone-700 sm:text-base">
                Specialist intelligence is shown only when a verified production snapshot is supplied. Demo and fixture conclusions stay outside live business truth.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">LIVE EVIDENCE: UNAVAILABLE</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">UNKNOWN</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <TruthBoundaryMetric label="Current specialist conclusions" value="Withheld without production evidence" />
            <TruthBoundaryMetric label="Fixture substitution" value="Disabled for production" />
            <TruthBoundaryMetric label="Safe behavior" value="Expose gaps before recommendations" />
          </div>
        </header>

        <section className="mt-5" aria-label="Specialist capability status">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-stone-950">Capability status</h2>
              <p className="mt-1 text-sm leading-6 text-stone-600">What can be trusted now, what is missing, and the next safe evidence step.</p>
            </div>
            <a href="/data-evidence" className="inline-flex w-fit rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm">
              Open Data &amp; Evidence
            </a>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {capabilities.map((capability) => (
              <article key={capability.id} className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{capability.availability}</p>
                    <h3 className="mt-1 text-xl font-semibold text-stone-950">{capability.title}</h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${truthStyles[capability.truth_state]}`}>
                    {capability.truth_state}
                  </span>
                </div>

                <dl className="mt-5 space-y-4 text-sm leading-6">
                  <CapabilityRow label="What can be trusted" value={capability.can_trust} />
                  <CapabilityRow label="Missing evidence" value={capability.missing_evidence} />
                  <CapabilityRow label="Next safe step" value={capability.next_safe_step} />
                  <CapabilityRow label="Freshness" value={capability.evidence_freshness} />
                </dl>

                {capability.detail_href ? (
                  <a href={capability.detail_href} className="mt-5 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
                    Open verified specialist detail
                  </a>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white p-3 text-xs leading-5 text-stone-600">
                    No specialist detail link is exposed until production-backed evidence supports the displayed state.
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Specialist operating boundary">
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">What this prevents</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">Fixture conclusions masquerading as live intelligence</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Financial, goals/capacity, and relationship previews can still support deterministic testing, but they do not fill production gaps or create false confidence.
            </p>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Where to work meanwhile</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">Use production-backed workspaces directly</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/relationships" className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800">Relationships</a>
              <a href="/opportunities-actions" className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800">Opportunities &amp; Actions</a>
              <a href="/dashboard" className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800">Executive Home</a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function TruthBoundaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-2 text-sm font-semibold leading-5 text-stone-950">{value}</div>
    </div>
  );
}

function CapabilityRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-700">{value}</dd>
    </div>
  );
}

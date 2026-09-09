import type { CrmDirectoryEvidenceStateV1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import type { CrmPersonDetailV1 } from "@/lib/relationships-crm/crm-person-detail-v1";

const EVIDENCE_STYLE: Record<CrmDirectoryEvidenceStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

function display(value: string | null): string {
  return value ?? "Unknown";
}

function EvidenceBadge({ state }: { state: CrmDirectoryEvidenceStateV1 }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>
      {state}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-stone-950">{value}</dd>
    </div>
  );
}

export function CrmPersonDetailV1({ person }: { person: CrmPersonDetailV1 }) {
  return (
    <main
      className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8"
      data-testid="crm-person-detail-v1"
      data-visual-mode="light"
    >
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Relationships · Person</p>
                <EvidenceBadge state={person.evidenceState} />
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{display(person.name)}</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {display(person.title)} · {display(person.companyName)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/relationships/people" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Back to People
              </a>
              <a href="/relationships" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                CRM Home
              </a>
            </div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Relationship snapshot">
          <Metric label="Relationship" value={display(person.relationshipState)} />
          <Metric label="Strength" value={person.relationshipStrength} />
          <Metric label="Last touch" value={display(person.lastTouchAt)} />
          <Metric label="Next follow-up" value={display(person.nextFollowUpAt)} />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Contact channels">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Contact</h2>
              <span className="text-xs font-semibold text-stone-500">READ ONLY</span>
            </div>
            {person.contactChannels.length ? (
              <dl className="mt-4 space-y-3">
                {person.contactChannels.map((channel, index) => (
                  <div key={`${channel.kind}-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{channel.kind}</dt>
                        <dd className="mt-1 break-all text-sm font-medium text-stone-950">{display(channel.value)}</dd>
                      </div>
                      <EvidenceBadge state={channel.evidenceState} />
                    </div>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm leading-6 text-stone-600">No verified contact channel is supplied for this record.</p>
            )}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Current business context">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Current business context</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Active opportunity</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">{display(person.activeOpportunity)}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Active ask</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">{display(person.activeAsk)}</p>
              </div>
            </div>
            <div className={`mt-4 rounded-2xl border p-4 ${person.verificationRequired ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-600">Recommended next move</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-stone-950">{person.recommendedNextMove}</p>
            </div>
          </section>
        </div>

        <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Relationship depth">
          <details className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-950">Activity and touchpoint depth</summary>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              The current directory contract supplies last-touch and next-follow-up timing only. No additional activity events are invented here; a canonical timeline can populate this section in a later evidence-backed slice.
            </p>
          </details>
          <details className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-950">Evidence and provenance</summary>
            <div className="mt-3 flex items-center gap-2">
              <EvidenceBadge state={person.evidenceState} />
              <span className="text-sm text-stone-700">
                {person.verificationRequired ? "Verification is required before treating this record as action-ready." : "Current directory evidence is marked KNOWN."}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Low-level provenance references are not exposed by the current directory contract. This view does not manufacture source IDs, notes, commitments, or correspondence history.
            </p>
          </details>
        </section>
      </div>
    </main>
  );
}

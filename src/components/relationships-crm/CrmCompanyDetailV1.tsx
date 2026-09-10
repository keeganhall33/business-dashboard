import type { CrmDirectoryEvidenceStateV1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import type { CrmCompanyDetailV1 } from "@/lib/relationships-crm/crm-company-detail-v1";

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
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>{state}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-stone-950">{value}</dd></div>;
}

function ListBlock({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{label}</h2>
      {values.length ? <ul className="mt-3 space-y-2">{values.map((value) => <li key={value} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-950">{value}</li>)}</ul> : <p className="mt-3 text-sm leading-6 text-stone-600">Unknown</p>}
    </section>
  );
}

export function CrmCompanyDetailV1({ company }: { company: CrmCompanyDetailV1 }) {
  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="crm-company-detail-v1" data-visual-mode="light">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Relationships · Company</p><EvidenceBadge state={company.evidenceState} /></div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{display(company.name)}</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">{display(company.category)}</p>
            </div>
            <div className="flex flex-wrap gap-2"><a href="/relationships/companies" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">Back to Companies</a><a href="/relationships" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">CRM Home</a></div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Company relationship snapshot">
          <Metric label="Relationship" value={display(company.relationshipState)} />
          <Metric label="Last activity" value={display(company.lastActivityAt)} />
          <Metric label="Supported value" value={display(company.supportedValue)} />
          <Metric label="Evidence" value={company.evidenceState} />
        </section>

        <section className={`mt-5 rounded-3xl border p-5 shadow-sm ${company.verificationRequired ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} aria-label="Recommended next move">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">Recommended next move</p>
          <p className="mt-2 text-base font-semibold leading-7 text-stone-950">{company.recommendedNextMove}</p>
          {company.verificationRequired ? <p className="mt-2 text-sm text-stone-700">Verification is required before treating this company record as action-ready.</p> : null}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ListBlock label="Active opportunities" values={company.activeOpportunities} />
          <ListBlock label="Key people" values={company.keyPeople} />
        </div>

        <section className="mt-5 grid gap-4 lg:grid-cols-2" aria-label="Company evidence depth">
          <details className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-semibold text-stone-950">Current company context</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Metric label="Supplied next move" value={display(company.nextMove)} /><Metric label="Supported value" value={display(company.supportedValue)} /></dl></details>
          <details className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><summary className="cursor-pointer text-sm font-semibold text-stone-950">Evidence and provenance</summary><div className="mt-3 flex items-center gap-2"><EvidenceBadge state={company.evidenceState} /><span className="text-sm text-stone-700">{company.verificationRequired ? "Verification is required before action." : "Current directory evidence is marked KNOWN."}</span></div><p className="mt-3 text-sm leading-6 text-stone-600">The current directory contract does not expose source IDs, private correspondence, commitments, or inferred economics. This workspace does not invent them.</p></details>
        </section>
      </div>
    </main>
  );
}

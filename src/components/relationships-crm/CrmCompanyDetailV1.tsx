import type { CrmDirectoryEvidenceStateV1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import type { CrmCompanyDetailV1 } from "@/lib/relationships-crm/crm-company-detail-v1";

const EVIDENCE_STYLE: Record<CrmDirectoryEvidenceStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900"
};

function display(value: string | null): string {
  return value ?? "Not recorded";
}

function EvidenceBadge({ state }: { state: CrmDirectoryEvidenceStateV1 }) {
  const label = state === "KNOWN" ? "Connected" : state === "STALE" ? "Needs update" : state === "CONFLICTED" ? "Conflicting data" : "Incomplete";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd></div>;
}

function ListBlock({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{label}</h2>
      {values.length ? <ul className="mt-3 space-y-2">{values.map((value) => <li key={value} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-950">{value}</li>)}</ul> : <p className="mt-3 text-sm leading-6 text-slate-600">Not recorded</p>}
    </section>
  );
}

function LinkedListBlock({ label, values }: { label: string; values: readonly { id: string; label: string; href: string }[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{label}</h2>
      {values.length ? <ul className="mt-3 space-y-2">{values.map((value) => <li key={value.id}><Link href={value.href} className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-blue-700 hover:border-blue-300">{value.label}</Link></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-slate-600">Not recorded</p>}
    </section>
  );
}

export function CrmCompanyDetailV1({ company }: { company: CrmCompanyDetailV1 }) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" data-testid="crm-company-detail-v1" data-visual-mode="light">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relationships · Company</p><EvidenceBadge state={company.evidenceState} /></div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{display(company.name)}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{display(company.category)}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Link href="/relationships/companies" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Back to Companies</Link><Link href="/relationships" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">CRM Home</Link></div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Company relationship snapshot">
          <Metric label="Relationship" value={display(company.relationshipState)} />
          <Metric label="Relationship quality" value={company.relationshipStrength === "UNKNOWN" ? "Not assessed" : String(company.relationshipStrength).toLowerCase()} />
          <Metric label="Last activity" value={display(company.lastActivityAt)} />
          <Metric label="Next follow-up" value={display(company.nextFollowUpAt)} />
        </section>

        <section className={`mt-5 rounded-3xl border p-5 shadow-sm ${company.verificationRequired ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`} aria-label="Recommended next move">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Recommended next move</p>
          <p className="mt-2 text-base font-semibold leading-7 text-slate-950">{company.recommendedNextMove}</p>
          {company.verificationRequired ? <p className="mt-2 text-sm text-slate-700">This record needs a current contact, activity, or next-step update.</p> : null}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {company.activeOpportunityLinks.length ? <LinkedListBlock label="Active opportunities" values={company.activeOpportunityLinks} /> : <ListBlock label="Active opportunities" values={company.activeOpportunities} />}
          {company.keyPeopleLinks.length ? <LinkedListBlock label="Key people" values={company.keyPeopleLinks} /> : <ListBlock label="Key people" values={company.keyPeople} />}
        </div>

        {company.relatedCompanies.length ? <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Related companies</h2><ul className="mt-3 flex flex-wrap gap-2">{company.relatedCompanies.map((related) => <li key={`${related.id}-${related.relationship}`}><Link href={related.href} className="inline-flex rounded-full border border-slate-300 px-3 py-2 text-sm text-blue-700 hover:border-blue-400">{related.label} · {related.relationship}</Link></li>)}</ul></section> : null}

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Record coverage"><h2 className="text-sm font-semibold text-slate-950">Record coverage</h2><p className="mt-2 text-sm leading-6 text-slate-600">{company.verificationRequired ? "This company is missing current relationship details. Connected email and manual updates should fill those gaps." : "This company is connected to current relationship data."}</p></section>
        <section className="mt-5" aria-label="Edit company"><CrmRecordEditorV1 values={{ id: company.id, entityType: "organization", name: company.name, category: company.category, email: company.primaryEmail, phone: company.phone, websiteUrl: company.websiteUrl, notes: company.notesMd, relationshipState: company.relationshipState, relationshipQuality: company.relationshipStrength, lastTouchAt: company.lastActivityAt, nextFollowUpAt: company.nextFollowUpAt, nextMove: company.nextMove, supportedValue: company.supportedValue }} /></section>
        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Add person to {company.name ?? "this company"}</summary><div className="mt-4"><CrmRecordEditorV1 mode="create" values={{ entityType: "person", companyName: company.name }} companies={[{ id: company.id, name: company.name ?? "This company" }]} /></div></details>
      </div>
    </main>
  );
}
import Link from "next/link";

import { CrmRecordEditorV1 } from "@/components/relationships-crm/CrmRecordEditorV1";

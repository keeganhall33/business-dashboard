import type { CrmDirectoryEvidenceStateV1 } from "@/lib/relationships-crm/crm-directory-index-v1";
import type { CrmPersonDetailV1 } from "@/lib/relationships-crm/crm-person-detail-v1";

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
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_STYLE[state]}`}>
      {label}
    </span>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
      {helper ? <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

function relationshipStrength(value: CrmPersonDetailV1["relationshipStrength"]): string {
  if (value === "HIGH") return "Strong";
  if (value === "MEDIUM") return "Developing";
  if (value === "LOW") return "Limited";
  return "Not recorded";
}

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function CrmPersonDetailV1({ person, companies = [] }: { person: CrmPersonDetailV1; companies?: readonly { id: string; name: string }[] }) {
  const email = person.contactChannels.find((channel) => channel.kind === "EMAIL")?.value ?? null;
  const phone = person.contactChannels.find((channel) => channel.kind === "PHONE")?.value ?? null;
  const linkedinUrl = person.contactChannels.find((channel) => channel.kind === "LINKEDIN")?.value ?? null;
  return (
    <main
      className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-testid="crm-person-detail-v1"
      data-visual-mode="light"
    >
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relationships · Person</p>
                <EvidenceBadge state={person.evidenceState} />
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{display(person.name)}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{person.title ?? "Role not recorded"}{person.companyName ? <> · {person.companyHref ? <Link href={person.companyHref} className="text-blue-700 underline-offset-4 hover:underline">{person.companyName}</Link> : person.companyName}</> : null}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/relationships/people" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                Back to People
              </Link>
              <Link href="/relationships" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                CRM Home
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Relationship snapshot">
          <Metric label="Relationship status" value={display(person.relationshipState)} helper="Your current status, such as in conversation or waiting on a reply." />
          <Metric label="Relationship strength" value={relationshipStrength(person.relationshipStrength)} helper="Your assessment of the direct relationship, not an automated score." />
          <Metric label="Last contact" value={displayDate(person.lastTouchAt)} helper="Update after a meaningful email, call, or meeting." />
          <Metric label="Next follow-up" value={displayDate(person.nextFollowUpAt)} helper="Appears in the follow-up queue when it is due." />
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Contact channels">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Contact</h2>
            </div>
            {person.contactChannels.length ? (
              <dl className="mt-4 space-y-3">
                {person.contactChannels.map((channel, index) => (
                  <div key={`${channel.kind}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{channel.kind}</dt>
                        <dd className="mt-1 break-all text-sm font-medium text-slate-950">{display(channel.value)}</dd>
                      </div>
                      <EvidenceBadge state={channel.evidenceState} />
                    </div>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-600">No email or phone is currently connected to this record.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Current business context">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current business context</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Active opportunity</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{person.activeOpportunityHref && person.activeOpportunity ? <Link href={person.activeOpportunityHref} className="text-blue-700 hover:underline">{person.activeOpportunity}</Link> : display(person.activeOpportunity)}</p>
              </div>
              {person.activeAsk ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Waiting on / current ask</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{person.activeAsk}</p>
              </div> : null}
            </div>
            {person.recommendedNextMove ? <div className={`mt-4 rounded-2xl border p-4 ${person.verificationRequired ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">Recommended next move</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-950">{person.recommendedNextMove}</p>
            </div> : null}
          </section>
        </div>

        {person.notesMd ? <details className="mt-5 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-slate-950">Background and notes</summary>
          <div className="whitespace-pre-wrap border-t border-slate-200 p-5 text-sm leading-6 text-slate-700">{person.notesMd}</div>
        </details> : null}

        <details className="mt-5 rounded-3xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-slate-950">Edit contact details and follow-up</summary>
          <section className="border-t border-slate-200 p-3" aria-label="Edit person">
            <CrmRecordEditorV1
              values={{ id: person.id, entityType: "person", name: person.name, title: person.title, email, phone, linkedinUrl, notes: person.notesMd, companyName: person.companyName, relationshipState: person.relationshipState, relationshipQuality: person.relationshipStrength, lastTouchAt: person.lastTouchAt, nextFollowUpAt: person.nextFollowUpAt, nextMove: person.activeAsk }}
              companies={companies}
            />
          </section>
        </details>
      </div>
    </main>
  );
}
import Link from "next/link";

import { CrmRecordEditorV1 } from "@/components/relationships-crm/CrmRecordEditorV1";

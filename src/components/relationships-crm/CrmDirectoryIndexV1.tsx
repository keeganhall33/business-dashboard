import type { ReactNode } from "react";

import {
  type CrmCompanyDirectoryRecordV1,
  type CrmDirectoryEvidenceStateV1,
  type CrmDirectoryIndexV1,
  type CrmPersonDirectoryRecordV1,
  sortCrmCompaniesV1,
  sortCrmPeopleV1
} from "@/lib/relationships-crm/crm-directory-index-v1";

export type CrmDirectoryModeV1 = "OVERVIEW" | "PEOPLE" | "COMPANIES";

const EVIDENCE_TONE: Record<CrmDirectoryEvidenceStateV1, string> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-800",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-800"
};

function display(value: string | null): string {
  return value?.trim() || "Unknown";
}

function displayDate(value: string | null): string {
  if (!value) return "Unknown";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : "Unknown";
}

function EvidenceBadge({ state }: { state: CrmDirectoryEvidenceStateV1 }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${EVIDENCE_TONE[state]}`}>
      {state}
    </span>
  );
}

function CrmNav({ active }: { active: CrmDirectoryModeV1 }) {
  const links = [
    { mode: "OVERVIEW" as const, href: "/relationships", label: "CRM Home" },
    { mode: "PEOPLE" as const, href: "/relationships/people", label: "People" },
    { mode: "COMPANIES" as const, href: "/relationships/companies", label: "Companies" }
  ];

  return (
    <nav aria-label="CRM navigation" className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.mode}
          href={link.href}
          aria-current={active === link.mode ? "page" : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            active === link.mode
              ? "border-stone-950 bg-stone-950 text-white"
              : "border-stone-300 bg-white text-stone-800 hover:border-stone-500"
          }`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function DirectoryShell({
  active,
  eyebrow,
  title,
  description,
  children
}: {
  active: CrmDirectoryModeV1;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="crm-directory-index-v1">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>
            </div>
            <CrmNav active={active} />
          </div>
        </header>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

function EmptyDirectory({ kind }: { kind: "people" | "companies" }) {
  return (
    <section className="rounded-3xl border border-dashed border-stone-300 bg-white p-6" aria-label={`No verified ${kind}`}>
      <p className="text-sm font-semibold text-stone-950">No verified {kind} records are available yet.</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
        This directory stays empty rather than inventing CRM facts. Evidence-backed records can populate it through the canonical relationship data path.
      </p>
    </section>
  );
}

function PersonChannels({ person }: { person: CrmPersonDirectoryRecordV1 }) {
  if (!person.contactChannels.length) return <span className="text-stone-500">Unknown</span>;
  return (
    <div className="space-y-1">
      {person.contactChannels.map((channel, index) => (
        <div key={`${channel.kind}-${index}`} className="whitespace-nowrap text-xs">
          <span className="font-semibold text-stone-500">{channel.kind}</span>{" "}
          <span>{display(channel.value)}</span>
          {channel.evidenceState !== "KNOWN" ? <span className="ml-1 text-stone-500">({channel.evidenceState})</span> : null}
        </div>
      ))}
    </div>
  );
}

function PeopleTable({ people }: { people: readonly CrmPersonDirectoryRecordV1[] }) {
  if (!people.length) return <EmptyDirectory kind="people" />;
  const rows = sortCrmPeopleV1(people);

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" aria-label="People directory">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Relationship</th>
              <th className="px-4 py-3 font-semibold">Last touch</th>
              <th className="px-4 py-3 font-semibold">Next follow-up</th>
              <th className="px-4 py-3 font-semibold">Opportunity / ask</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((person) => (
              <tr key={person.id} data-record-id={person.id} className="align-top">
                <td className="px-4 py-4">
                  <div className="font-semibold text-stone-950">{display(person.name)}</div>
                  <div className="mt-1 text-xs text-stone-500">{display(person.title)}</div>
                </td>
                <td className="px-4 py-4">{display(person.companyName)}</td>
                <td className="px-4 py-4"><PersonChannels person={person} /></td>
                <td className="px-4 py-4">
                  <div>{display(person.relationshipState)}</div>
                  <div className="mt-1 text-xs text-stone-500">Strength {person.relationshipStrength}</div>
                </td>
                <td className="px-4 py-4 tabular-nums">{displayDate(person.lastTouchAt)}</td>
                <td className="px-4 py-4 tabular-nums">{displayDate(person.nextFollowUpAt)}</td>
                <td className="px-4 py-4">
                  <div>{display(person.activeOpportunity)}</div>
                  <div className="mt-1 text-xs text-stone-500">Ask: {display(person.activeAsk)}</div>
                </td>
                <td className="px-4 py-4"><EvidenceBadge state={person.evidenceState} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CompactList({ values }: { values: readonly string[] }) {
  if (!values.length) return <span className="text-stone-500">Unknown</span>;
  return <span>{values.join(", ")}</span>;
}

function CompaniesTable({ companies }: { companies: readonly CrmCompanyDirectoryRecordV1[] }) {
  if (!companies.length) return <EmptyDirectory kind="companies" />;
  const rows = sortCrmCompaniesV1(companies);

  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" aria-label="Companies directory">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Key people</th>
              <th className="px-4 py-3 font-semibold">Relationship</th>
              <th className="px-4 py-3 font-semibold">Active opportunities</th>
              <th className="px-4 py-3 font-semibold">Last activity</th>
              <th className="px-4 py-3 font-semibold">Next move</th>
              <th className="px-4 py-3 font-semibold">Supported value</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((company) => (
              <tr key={company.id} data-record-id={company.id} className="align-top">
                <td className="px-4 py-4 font-semibold text-stone-950">{display(company.name)}</td>
                <td className="px-4 py-4">{display(company.category)}</td>
                <td className="px-4 py-4"><CompactList values={company.keyPeople} /></td>
                <td className="px-4 py-4">{display(company.relationshipState)}</td>
                <td className="px-4 py-4"><CompactList values={company.activeOpportunities} /></td>
                <td className="px-4 py-4 tabular-nums">{displayDate(company.lastActivityAt)}</td>
                <td className="px-4 py-4">{display(company.nextMove)}</td>
                <td className="px-4 py-4">{display(company.supportedValue)}</td>
                <td className="px-4 py-4"><EvidenceBadge state={company.evidenceState} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CrmDirectoryIndexV1({
  index,
  mode
}: {
  index: CrmDirectoryIndexV1;
  mode: CrmDirectoryModeV1;
}) {
  if (mode === "PEOPLE") {
    return (
      <DirectoryShell
        active="PEOPLE"
        eyebrow="Relationships · CRM"
        title="People"
        description="Evidence-backed contacts, relationship state, touch timing, and current business context. Unknown fields stay unknown."
      >
        <PeopleTable people={index.people} />
      </DirectoryShell>
    );
  }

  if (mode === "COMPANIES") {
    return (
      <DirectoryShell
        active="COMPANIES"
        eyebrow="Relationships · CRM"
        title="Companies"
        description="Organizations, key people, relationship context, active opportunities, and next moves without invented CRM facts."
      >
        <CompaniesTable companies={index.companies} />
      </DirectoryShell>
    );
  }

  return (
    <DirectoryShell
      active="OVERVIEW"
      eyebrow="Mission Control · CRM"
      title="Relationships"
      description="A scan-first relationship workspace organized around people and companies. Canonical evidence is the source of truth."
    >
      <section className="grid gap-4 md:grid-cols-2" aria-label="CRM directories">
        <a href="/relationships/people" className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-400">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Directory</p>
              <h2 className="mt-1 text-xl font-semibold">People</h2>
            </div>
            <span className="text-3xl font-semibold tabular-nums">{index.people.length}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-600">Contacts, channels, relationship state, touchpoints, follow-ups, opportunities, and asks.</p>
        </a>
        <a href="/relationships/companies" className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-400">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Directory</p>
              <h2 className="mt-1 text-xl font-semibold">Companies</h2>
            </div>
            <span className="text-3xl font-semibold tabular-nums">{index.companies.length}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-600">Organizations, key people, active opportunities, last activity, next move, and supported value.</p>
        </a>
      </section>
      {index.people.length === 0 && index.companies.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-stone-300 bg-white p-5 text-sm leading-6 text-stone-600">
          No verified CRM records are currently projected into this directory. Synthetic contacts and companies are intentionally not shown.
        </div>
      ) : null}
    </DirectoryShell>
  );
}

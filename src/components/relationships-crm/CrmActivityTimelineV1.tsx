import type { CrmActivityTimelineItemV1, CrmActivityTimelineV1 as CrmActivityTimelineViewV1 } from "@/lib/relationships-crm/crm-activity-timeline-v1";

const KIND_LABELS: Record<CrmActivityTimelineItemV1["kind"], string> = {
  DIRECT_EMAIL: "Direct email",
  EMAIL_SYSTEM_EVENT: "Email system event",
  EMAIL_UNCLASSIFIED: "Email activity",
  MEETING: "Meeting",
  CALL: "Call",
  INTRODUCTION: "Introduction",
  NOTE: "Note",
  FOLLOW_UP: "Follow-up",
  EVENT: "Event",
  PROJECT: "Project",
  DECISION: "Decision",
  SYSTEM_EVENT: "System event",
};

function displayTimestamp(value: string | null): string {
  if (!value) return "Timestamp unknown";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "Timestamp unknown";
}

function ActivityItem({ item }: { item: CrmActivityTimelineItemV1 }) {
  const relationshipHref = item.contactId ? `/relationships/people/${encodeURIComponent(item.contactId)}` : null;
  const companyHref = item.companyId ? `/relationships/companies/${encodeURIComponent(item.companyId)}` : null;

  return (
    <article className="grid gap-3 border-t border-stone-200 py-4 first:border-t-0 md:grid-cols-[10rem_minmax(0,1fr)]" data-activity-kind={item.kind}>
      <div>
        <p className="text-xs font-semibold text-stone-500">{displayTimestamp(item.timestamp)}</p>
        <p className="mt-1 text-xs text-stone-500">{KIND_LABELS[item.kind]}</p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-stone-700">
            {item.provenance.replaceAll("_", " ")}
          </span>
          {item.direction ? (
            <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-700">{item.direction}</span>
          ) : null}
          <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-700">{item.truthState}</span>
          <span className="rounded-full border border-stone-200 bg-white px-2 py-1 text-[10px] font-semibold text-stone-700">{item.freshnessState}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-stone-950">{item.summary}</p>
        {item.actorLabel || item.entityLabel ? (
          <p className="mt-1 text-sm text-stone-600">
            {[item.actorLabel, item.entityLabel].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {relationshipHref ? <a className="text-stone-800 underline decoration-stone-300 underline-offset-4" href={relationshipHref}>Person record</a> : null}
          {companyHref ? <a className="text-stone-800 underline decoration-stone-300 underline-offset-4" href={companyHref}>Company record</a> : null}
          {item.opportunityIds.map((opportunityId) => (
            <span key={opportunityId} className="text-stone-500">Opportunity: {opportunityId}</span>
          ))}
        </div>
        <details className="mt-3 text-xs text-stone-600">
          <summary className="cursor-pointer font-semibold text-stone-700">Evidence details</summary>
          <div className="mt-2 space-y-1">
            <p>Evidence refs: {item.evidenceRefs.length ? item.evidenceRefs.join(", ") : "Unavailable"}</p>
            <p>Activity ID: {item.id}</p>
          </div>
        </details>
      </div>
    </article>
  );
}

export function CrmActivityTimelineV1({ timeline }: { timeline: CrmActivityTimelineViewV1 | null }) {
  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8" data-testid="crm-activity-timeline-v1">
      <div className="mx-auto max-w-[1400px]">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Relationships / CRM</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Activity</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                A chronological view of verified relationship touchpoints. Direct correspondence stays distinct from recorded and automated activity.
              </p>
            </div>
            <nav aria-label="CRM activity navigation" className="flex flex-wrap gap-2">
              <a href="/relationships" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">CRM Home</a>
              <a href="/relationships/people" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">People</a>
              <a href="/relationships/companies" className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800">Companies</a>
            </nav>
          </div>
        </header>

        {!timeline ? (
          <section className="mt-5 rounded-3xl border border-dashed border-stone-300 bg-white p-6" aria-labelledby="crm-activity-unavailable-title">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Production coverage</p>
            <h2 id="crm-activity-unavailable-title" className="mt-2 text-xl font-semibold">Activity timeline unavailable</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              No authoritative production activity loader is connected to this route yet. The timeline stays empty rather than inventing emails, meetings, calls, notes, or follow-ups.
            </p>
          </section>
        ) : timeline.items.length === 0 ? (
          <section className="mt-5 rounded-3xl border border-dashed border-stone-300 bg-white p-6">
            <h2 className="text-lg font-semibold">No supported activity yet</h2>
            <p className="mt-1 text-sm text-stone-600">Canonical activity evidence supplied no timeline items.</p>
          </section>
        ) : (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Activity coverage summary">
              <Metric label="Direct human" value={timeline.directHumanCount} />
              <Metric label="System events" value={timeline.systemEventCount} />
              <Metric label="Needs provenance review" value={timeline.unknownProvenanceCount} />
            </section>
            <section className="mt-5 rounded-3xl border border-stone-200 bg-white px-5 shadow-sm" aria-label="Chronological relationship activity">
              {timeline.items.map((item) => <ActivityItem key={item.id} item={item} />)}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-950">{value}</p>
    </div>
  );
}

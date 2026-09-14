import React from "react";

import type {
  CanonicalRelationshipFollowUpQueueItemV1,
  CanonicalRelationshipFollowUpQueueResultV1,
  RelationshipFollowUpQueueClassV1
} from "@/lib/relationships-crm/canonical-follow-up-queue-v1";

const QUEUE_LABELS: Record<RelationshipFollowUpQueueClassV1, string> = {
  REQUIRES_VERIFICATION: "Requires verification",
  OVERDUE: "Overdue",
  NEEDS_REPLY: "Needs reply",
  STALE_OPPORTUNITY: "Stale opportunity",
  FOLLOW_UP_THIS_WEEK: "Follow up this week",
  WAITING_ON_CONTACT: "Waiting on contact",
  RECENTLY_REENGAGED: "Recently re-engaged",
  HIGH_VALUE: "High value"
};

const QUEUE_ORDER = Object.keys(QUEUE_LABELS) as RelationshipFollowUpQueueClassV1[];

function displayTimestamp(value: string | null): string {
  if (!value) return "UNKNOWN";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`
    : "UNKNOWN";
}

function QueueItem({ item }: { item: CanonicalRelationshipFollowUpQueueItemV1 }) {
  return (
    <article
      className="border-t border-slate-200 py-5 first:border-t-0"
      data-queue-class={item.primaryQueueClass}
      data-requires-review={item.requiresReview}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            {item.queueClasses.map((queueClass) => (
              <span key={queueClass} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700">
                {QUEUE_LABELS[queueClass]}
              </span>
            ))}
          </div>
          <h2 className="mt-3 text-lg font-semibold text-slate-950">Contact {item.contactId}</h2>
          <p className="mt-1 text-sm text-slate-600">Suggested move: {item.suggestedMove.replaceAll("_", " ")}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-slate-600 lg:text-right">
          <span>Priority</span><strong className="text-slate-900">{item.priority}</strong>
          <span>Due</span><strong className="text-slate-900">{displayTimestamp(item.dueAt)}</strong>
          <span>Last interaction</span><strong className="text-slate-900">{displayTimestamp(item.lastMeaningfulInteractionAt)}</strong>
          <span>Truth</span><strong className="text-slate-900">{item.truthState}</strong>
          <span>Freshness</span><strong className="text-slate-900">{item.freshnessState}</strong>
        </div>
      </div>

      {item.requiresReview ? (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
          Verification required before this record can drive a consequential action.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
        <a className="text-slate-800 underline decoration-slate-300 underline-offset-4" href={`/relationships/people/${encodeURIComponent(item.contactId)}`}>
          Person record
        </a>
        {item.opportunityIds.map((opportunityId) => (
          <a key={opportunityId} className="text-slate-800 underline decoration-slate-300 underline-offset-4" href={`/opportunities-actions/opportunity/${encodeURIComponent(opportunityId)}`}>
            Opportunity {opportunityId}
          </a>
        ))}
      </div>

      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-700">Evidence and identity</summary>
        <div className="mt-2 space-y-1">
          <p>Thread: {item.threadId}</p>
          <p>Follow-ups: {item.followUpIds.length ? item.followUpIds.join(", ") : "None recorded"}</p>
          <p>Evidence refs: {item.evidenceRefs.length ? item.evidenceRefs.join(", ") : "UNKNOWN"}</p>
        </div>
      </details>
    </article>
  );
}

export function CrmFollowUpQueueV1({ queue }: { queue: CanonicalRelationshipFollowUpQueueResultV1 | null }) {
  const items = queue ? [...queue.items].sort((a, b) => a.priority - b.priority || a.itemId.localeCompare(b.itemId)) : [];

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8" data-testid="crm-follow-up-queue-v1">
      <div className="mx-auto max-w-[1400px]">
        <header className="rounded-[2rem] border border-slate-200 bg-[#ffffff] p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Relationships / CRM</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Follow-ups</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                A scan-first queue built only from canonical relationship evidence, with uncertainty and review gates kept visible.
              </p>
            </div>
            <nav aria-label="CRM follow-up navigation" className="flex flex-wrap gap-2">
              <a href="/relationships" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">CRM Home</a>
              <a href="/relationships/activity" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Activity</a>
              <a href="/relationships/people" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">People</a>
            </nav>
          </div>
        </header>

        {!queue ? (
          <section className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-6" aria-labelledby="crm-follow-ups-unavailable-title">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Production coverage</p>
            <h2 id="crm-follow-ups-unavailable-title" className="mt-2 text-xl font-semibold">Follow-up queue unavailable</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              No authoritative production follow-up loader is connected to this route yet. The queue stays unavailable rather than inventing contacts, reply states, due dates, value, urgency, or work.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Follow-up queue counts">
              {QUEUE_ORDER.map((queueClass) => (
                <div key={queueClass} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{QUEUE_LABELS[queueClass]}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{queue.counts[queueClass]}</p>
                </div>
              ))}
            </section>

            {items.length === 0 ? (
              <section className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-6">
                <h2 className="text-lg font-semibold">No supported follow-ups</h2>
                <p className="mt-1 text-sm text-slate-600">Canonical queue evidence supplied no actionable or verification-required records.</p>
              </section>
            ) : (
              <section className="mt-5 rounded-3xl border border-slate-200 bg-white px-5 shadow-sm" aria-label="Prioritized relationship follow-ups">
                {items.map((item) => <QueueItem key={item.itemId} item={item} />)}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

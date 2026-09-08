import type {
  IonosIntelligentInboxItemV1,
  IonosIntelligentInboxResultV1
} from "@/lib/email/ionos-intelligent-inbox-v1";

export const IONOS_EXECUTIVE_ATTENTION_LIMIT = 3;

const MAILBOX_LABELS: Readonly<Record<string, string>> = {
  PERSONAL_HIGH_VALUE_RELATIONSHIP: "Personal / high-value",
  ASSISTANT_CUSTOMER_SERVICE_OUTREACH: "Assistant / customer service",
  MARKETING_FUNNELKIT: "Marketing / FunnelKit"
};

export function visibleIonosExecutiveAttention(
  inbox: IonosIntelligentInboxResultV1
): IonosIntelligentInboxResultV1["executiveAttention"] {
  return inbox.executiveAttention.slice(0, IONOS_EXECUTIVE_ATTENTION_LIMIT);
}

function mailboxContext(item: IonosIntelligentInboxItemV1) {
  return item.mailboxRoles.map((role) => MAILBOX_LABELS[role] ?? role).join(" + ");
}

function requiresVerification(item: IonosIntelligentInboxItemV1) {
  return (
    !item.decisionEligible ||
    item.truthState !== "KNOWN" ||
    item.freshnessState !== "CURRENT" ||
    item.nextMove === "VERIFY_EVIDENCE"
  );
}

export function IonosCommunicationAttentionCard({
  inbox
}: {
  inbox: IonosIntelligentInboxResultV1 | null;
}) {
  if (inbox == null) {
    return (
      <section
        data-testid="ionos-communication-attention"
        className="mx-auto mt-5 max-w-7xl px-4 sm:px-6 lg:px-8"
        aria-label="Communication attention"
      >
        <div className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Relationship intelligence</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal text-stone-950">Communication attention</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
                Unavailable until live IONOS activation. Executive Home will not fabricate correspondence or attention counts.
              </p>
            </div>
            <a
              href="/relationships"
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-center text-sm font-semibold text-stone-800 shadow-sm"
            >
              Open Relationships
            </a>
          </div>
        </div>
      </section>
    );
  }

  const items = visibleIonosExecutiveAttention(inbox);

  return (
    <section
      data-testid="ionos-communication-attention"
      className="mx-auto mt-5 max-w-7xl px-4 sm:px-6 lg:px-8"
      aria-label="Communication attention"
    >
      <div className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Relationship intelligence</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-stone-950">Communication attention</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Canonical priority order only. Suggested next moves remain preparation-only until separately approved.
            </p>
          </div>
          <a href="/relationships" className="text-sm font-semibold text-stone-800 underline underline-offset-4">
            Open Relationships
          </a>
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm leading-6 text-stone-600">
            No communication items currently occupy the canonical Executive Attention queue.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {items.map((item) => {
              const verificationRequired = requiresVerification(item);
              const href = item.deepLink ?? "/relationships";
              return (
                <article key={item.id} data-attention-id={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600">
                    <span className="rounded-full border border-stone-200 px-2 py-1">{item.truthState}</span>
                    <span className="rounded-full border border-stone-200 px-2 py-1">{item.freshnessState}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-stone-500">{mailboxContext(item)}</p>
                  <dl className="mt-3 space-y-3 text-sm leading-6 text-stone-700">
                    <div>
                      <dt className="font-semibold text-stone-950">What happened</dt>
                      <dd>{item.whatHappened}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-stone-950">Why it matters</dt>
                      <dd>{item.whyItMatters}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-stone-950">Next safe move</dt>
                      <dd>{item.nextMove}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700">
                    {verificationRequired
                      ? "Verify before acting"
                      : item.nextMoveStatus === "SUGGESTED_UNVERIFIED"
                        ? "Suggested only · approval required"
                        : "No approval-gated move pending"}
                  </div>
                  <a href={href} className="mt-3 inline-block text-sm font-semibold text-stone-900 underline underline-offset-4">
                    Open relationship evidence
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

import type {
  IonosIntelligentInboxItemV1,
  IonosIntelligentInboxQueueNameV1,
  IonosIntelligentInboxResultV1
} from "@/lib/email/ionos-intelligent-inbox-v1";

type QueueDefinition = {
  key: IonosIntelligentInboxQueueNameV1;
  title: string;
  description: string;
  tone: string;
};

const QUEUES: readonly QueueDefinition[] = [
  { key: "needsReply", title: "Needs reply", description: "Direct inbound messages waiting on Keegan.", tone: "border-rose-200 bg-rose-50 text-rose-800" },
  { key: "waitingOnContact", title: "Waiting on contact", description: "The next move belongs to the other person.", tone: "border-sky-200 bg-sky-50 text-sky-800" },
  { key: "highValue", title: "High value", description: "Explicitly governed priority relationships.", tone: "border-violet-200 bg-violet-50 text-violet-800" },
  { key: "staleOpportunities", title: "Stale opportunities", description: "Active opportunity threads losing momentum.", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "recentReplies", title: "Recent replies", description: "Fresh inbound movement across connected mailboxes.", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { key: "suggestedCommitments", title: "Suggested commitments", description: "Unverified commitments requiring review.", tone: "border-orange-200 bg-orange-50 text-orange-900" },
  { key: "suggestedFollowUps", title: "Suggested follow-ups", description: "Preparation suggestions only. Nothing is sent.", tone: "border-stone-300 bg-stone-100 text-stone-800" }
];

const DEFAULT_QUEUE_LIMIT = 2;

const mailboxLabel: Record<string, string> = {
  PERSONAL_HIGH_VALUE_RELATIONSHIP: "Personal / high-value",
  ASSISTANT_CUSTOMER_SERVICE_OUTREACH: "Assistant / customer service",
  MARKETING_FUNNELKIT: "Marketing / FunnelKit"
};

function fixtureItem(
  id: string,
  overrides: Partial<IonosIntelligentInboxItemV1>
): IonosIntelligentInboxItemV1 {
  return {
    id,
    projectionId: id,
    threadId: `thread-${id}`,
    contactId: `contact-${id}`,
    opportunityIds: [],
    mailboxRoles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP"],
    primaryState: "NO_ACTION",
    states: ["NO_ACTION"],
    truthState: "KNOWN",
    freshnessState: "CURRENT",
    lastMeaningfulInteractionAt: "2026-09-08T17:00:00.000Z",
    lastMeaningfulDirection: "INBOUND",
    whatHappened: "A relationship signal changed.",
    whyItMatters: "The change may affect relationship timing.",
    nextMove: "NO_ACTION",
    nextMoveStatus: "NOT_APPLICABLE",
    blockingConditions: [],
    decisionEligible: true,
    evidenceFingerprint: `evidence-${id}`,
    deepLink: `/relationships#${id}`,
    ...overrides
  };
}

const needsReply = fixtureItem("arena-club", {
  opportunityIds: ["arena-club-chase"],
  mailboxRoles: ["PERSONAL_HIGH_VALUE_RELATIONSHIP", "ASSISTANT_CUSTOMER_SERVICE_OUTREACH"],
  primaryState: "NEEDS_REPLY",
  states: ["NEEDS_REPLY", "HIGH_VALUE", "ACTIVE_ASK"],
  whatHappened: "A direct Arena Club reply includes an active project question.",
  whyItMatters: "The Chase art-card project is an explicitly high-value relationship.",
  nextMove: "PREPARE_REPLY",
  nextMoveStatus: "SUGGESTED_UNVERIFIED",
  blockingConditions: ["OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL"]
});

const waiting = fixtureItem("pentel", {
  primaryState: "WAITING_ON_CONTACT",
  states: ["WAITING_ON_CONTACT"],
  lastMeaningfulDirection: "OUTBOUND",
  whatHappened: "The latest meaningful message was Keegan’s outbound partnership follow-up.",
  whyItMatters: "No new inbound response exists, so unnecessary outreach should be avoided.",
  nextMove: "WAIT_FOR_CONTACT",
  nextMoveStatus: "SUGGESTED_UNVERIFIED"
});

const stale = fixtureItem("corporate-art", {
  opportunityIds: ["corporate-art-program"],
  primaryState: "WAITING_ON_CONTACT",
  states: ["WAITING_ON_CONTACT", "STALE_THREAD", "STALE_OPPORTUNITY", "FOLLOW_UP_SUGGESTED"],
  freshnessState: "STALE",
  decisionEligible: false,
  lastMeaningfulDirection: "OUTBOUND",
  whatHappened: "A relationship-linked corporate art opportunity passed its freshness threshold.",
  whyItMatters: "The opportunity may be losing timing or internal sponsorship.",
  nextMove: "VERIFY_EVIDENCE",
  nextMoveStatus: "SUGGESTED_UNVERIFIED",
  blockingConditions: ["RELATIONSHIP_EVIDENCE_REQUIRES_VERIFICATION"]
});

const recent = fixtureItem("collector-reply", {
  mailboxRoles: ["ASSISTANT_CUSTOMER_SERVICE_OUTREACH"],
  primaryState: "RESOLVED",
  states: ["RESOLVED"],
  whatHappened: "A collector replied and the known request is resolved.",
  whyItMatters: "The response is retained as current relationship context without manufactured urgency."
});

const conflicted = fixtureItem("conflicted-evidence", {
  mailboxRoles: ["MARKETING_FUNNELKIT", "PERSONAL_HIGH_VALUE_RELATIONSHIP"],
  primaryState: "CONFLICTED",
  states: ["CONFLICTED"],
  truthState: "CONFLICTED",
  freshnessState: "UNKNOWN",
  decisionEligible: false,
  whatHappened: "Mailbox evidence conflicts across two source identities.",
  whyItMatters: "The relationship state must be verified before any follow-up is prepared.",
  nextMove: "VERIFY_EVIDENCE",
  nextMoveStatus: "SUGGESTED_UNVERIFIED",
  blockingConditions: ["CONFLICTED_REQUIRED_EVIDENCE"]
});

const unknown = fixtureItem("unknown-contact", {
  primaryState: "UNKNOWN",
  states: ["UNKNOWN"],
  truthState: "UNKNOWN",
  freshnessState: "UNKNOWN",
  decisionEligible: false,
  whatHappened: "The available evidence cannot establish a reliable relationship state.",
  whyItMatters: "Unknown identity or chronology could create a false follow-up.",
  nextMove: "VERIFY_EVIDENCE",
  nextMoveStatus: "SUGGESTED_UNVERIFIED",
  blockingConditions: ["REQUIRED_EVIDENCE_NOT_CURRENT_KNOWN"]
});

const commitment = fixtureItem("ymca-commitment", {
  opportunityIds: ["ymca-gala"],
  primaryState: "NEEDS_REPLY",
  states: ["NEEDS_REPLY", "COMMITMENT_SUGGESTED"],
  whatHappened: "Correspondence suggests a possible project commitment.",
  whyItMatters: "The commitment is not verified and must be reviewed before it becomes business truth.",
  nextMove: "PREPARE_REPLY",
  nextMoveStatus: "SUGGESTED_UNVERIFIED",
  blockingConditions: ["OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL"]
});

export const IONOS_INTELLIGENT_INBOX_WORKSPACE_FIXTURE_V1: IonosIntelligentInboxResultV1 = {
  generatedAt: "2026-09-08T17:05:00.000Z",
  needsReply: [needsReply, commitment],
  waitingOnContact: [waiting],
  staleOpportunities: [stale],
  highValue: [needsReply],
  recentReplies: [recent],
  suggestedCommitments: [commitment],
  suggestedFollowUps: [stale],
  requiresVerification: [stale, conflicted, unknown],
  executiveAttention: [
    { ...conflicted, attentionReason: "VERIFY_EVIDENCE" },
    { ...needsReply, attentionReason: "HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY" }
  ],
  telemetry: {
    projectionCount: 7,
    queueCounts: {
      needsReply: 2,
      waitingOnContact: 1,
      staleOpportunities: 1,
      highValue: 1,
      recentReplies: 1,
      suggestedCommitments: 1,
      suggestedFollowUps: 1,
      requiresVerification: 3,
      executiveAttention: 2
    },
    attentionReasonCodes: ["VERIFY_EVIDENCE", "HIGH_VALUE_ACTIVE_ASK_NEEDS_REPLY"],
    projectionFingerprints: [needsReply, waiting, stale, recent, conflicted, unknown, commitment]
      .map((item) => item.evidenceFingerprint)
      .sort(),
    generatedAt: "2026-09-08T17:05:00.000Z"
  }
};

export function visibleIonosInboxItems(
  items: readonly IonosIntelligentInboxItemV1[],
  limit = DEFAULT_QUEUE_LIMIT
): readonly IonosIntelligentInboxItemV1[] {
  return items.slice(0, Math.max(0, limit));
}

function stateTone(item: IonosIntelligentInboxItemV1): string {
  if (item.truthState === "CONFLICTED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (item.truthState === "UNKNOWN" || item.freshnessState === "UNKNOWN") return "border-amber-200 bg-amber-50 text-amber-900";
  if (item.freshnessState === "STALE") return "border-orange-200 bg-orange-50 text-orange-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function InboxItemCard({ item }: { item: IonosIntelligentInboxItemV1 }) {
  const suggestion = item.nextMoveStatus === "SUGGESTED_UNVERIFIED";
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${stateTone(item)}`}>
          {item.truthState} · {item.freshnessState}
        </span>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
          {item.primaryState.replaceAll("_", " ")}
        </span>
      </div>

      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">What happened</dt>
          <dd className="mt-1 font-medium text-stone-950">{item.whatHappened}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Why it matters</dt>
          <dd className="mt-1 text-stone-700">{item.whyItMatters}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Next safe move</dt>
          <dd className="mt-1 text-stone-700">{item.nextMove.replaceAll("_", " ")}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-stone-100 pt-3">
        <p className="text-xs font-semibold text-stone-700">
          {suggestion ? "Suggested only · approval required · nothing sent" : "Read-only relationship context"}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Mailboxes: {item.mailboxRoles.map((role) => mailboxLabel[role] ?? role).join(" + ")}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Freshness: {item.lastMeaningfulInteractionAt ?? "UNKNOWN"} · Evidence {item.evidenceFingerprint}
        </p>
        {item.blockingConditions.length ? (
          <p className="mt-1 text-xs leading-5 text-amber-800">Blocked: {item.blockingConditions.join(", ")}</p>
        ) : null}
        {item.deepLink ? (
          <a className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-900" href={item.deepLink}>
            Open relationship evidence
          </a>
        ) : null}
      </div>
    </article>
  );
}

function QueueSection({ definition, items }: { definition: QueueDefinition; items: readonly IonosIntelligentInboxItemV1[] }) {
  const visible = visibleIonosInboxItems(items);
  const overflow = items.slice(DEFAULT_QUEUE_LIMIT);

  return (
    <section aria-label={definition.title} className="rounded-3xl border border-stone-200 bg-[#fffdf8] p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-stone-950">{definition.title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">{definition.description}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${definition.tone}`}>{items.length}</span>
      </div>
      <div className="mt-4 grid gap-3">
        {visible.length ? visible.map((item) => <InboxItemCard key={item.id} item={item} />) : (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-600">No verified items in this queue.</p>
        )}
      </div>
      {overflow.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer rounded-full border border-stone-300 bg-white px-4 py-2 text-center text-sm font-semibold text-stone-800">
            View {overflow.length} more
          </summary>
          <div className="mt-3 grid gap-3">
            {overflow.map((item) => <InboxItemCard key={item.id} item={item} />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function IonosIntelligentInboxV1({ inbox }: { inbox: IonosIntelligentInboxResultV1 }) {
  return (
    <section
      aria-label="IONOS relationship intelligence"
      data-testid="ionos-intelligent-inbox-v1"
      data-visual-mode="light"
      className="bg-[#f8f4ec] px-4 py-8 text-stone-950 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Relationships · read-only intelligence</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">Intelligent relationship inbox</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700 md:text-base">
                One evidence-backed view across IONOS identities. It shows what changed, why it matters, and the next safe move without becoming an email client.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2" aria-label="Relationship attention summary">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center"><strong className="block text-xl">{inbox.needsReply.length}</strong><span className="text-xs">Need reply</span></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center"><strong className="block text-xl">{inbox.requiresVerification.length}</strong><span className="text-xs">Verify</span></div>
              <div className="rounded-2xl border border-stone-200 bg-white p-3 text-center"><strong className="block text-xl">{inbox.telemetry.projectionCount}</strong><span className="text-xs">Threads</span></div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-stone-500">Generated {inbox.generatedAt} · UNKNOWN, STALE, and CONFLICTED evidence never becomes verified action.</p>
        </header>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {QUEUES.map((definition) => (
            <QueueSection key={definition.key} definition={definition} items={inbox[definition.key]} />
          ))}
        </div>

        <section aria-label="Evidence verification queue" className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 md:p-5">
          <h3 className="text-lg font-semibold text-amber-950">Verify before acting</h3>
          <p className="mt-1 text-sm leading-6 text-amber-900">These records remain visibly uncertain and cannot produce an approved action.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inbox.requiresVerification.map((item) => <InboxItemCard key={item.id} item={item} />)}
          </div>
        </section>
      </div>
    </section>
  );
}

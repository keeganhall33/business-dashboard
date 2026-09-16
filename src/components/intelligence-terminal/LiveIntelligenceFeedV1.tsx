import type {
  LiveIntelligenceFeedItemV1,
  LiveIntelligenceFeedV1 as LiveIntelligenceFeedModelV1,
  LiveIntelligenceMaterialityV1,
  LiveIntelligenceTruthStateV1
} from "@/lib/intelligence-terminal/live-intelligence-feed-v1";

const TRUTH_STYLE: Readonly<Record<LiveIntelligenceTruthStateV1, string>> = {
  KNOWN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  INFERRED: "border-sky-200 bg-sky-50 text-sky-900",
  UNKNOWN: "border-amber-200 bg-amber-50 text-amber-900",
  STALE: "border-orange-200 bg-orange-50 text-orange-900",
  CONFLICTED: "border-rose-200 bg-rose-50 text-rose-900",
  PARTIAL: "border-violet-200 bg-violet-50 text-violet-900"
};

const MATERIALITY_STYLE: Readonly<Record<LiveIntelligenceMaterialityV1, string>> = {
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-900",
  HIGH: "border-orange-200 bg-orange-50 text-orange-900",
  MEDIUM: "border-slate-200 bg-slate-100 text-slate-800",
  LOW: "border-slate-200 bg-white text-slate-600"
};

function label(value: string): string {
  return value.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");
}

function FeedCard({ item }: { item: LiveIntelligenceFeedItemV1 }) {
  const drillDownRefs = [
    ...item.affectedRefs.entityRefs.map((value) => `Entity · ${value}`),
    ...item.affectedRefs.recommendationRefs.map((value) => `Recommendation · ${value}`),
    ...item.affectedRefs.decisionRefs.map((value) => `Decision · ${value}`)
  ];
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" data-testid="live-intelligence-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label(item.category)} · {new Date(item.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</p>
          <h3 className="mt-1 text-base font-semibold leading-6 text-slate-950">{item.whatChanged}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${MATERIALITY_STYLE[item.materiality]}`}>{item.materiality}</span>
          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${TRUTH_STYLE[item.truthState]}`}>{item.truthState}</span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Why it matters</p>
        <p className="mt-1 text-sm leading-5 text-slate-800">{item.whyItMatters ?? "Business impact is not yet established."}</p>
        {!item.whyItMattersSupported ? <p className="mt-2 text-xs font-semibold text-amber-800">Causality not established</p> : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Metric label="Freshness" value={label(item.freshness)} />
        <Metric label="Investigation" value={label(item.investigationState)} />
        <Metric label="Action" value={label(item.actionState)} />
        <Metric label="Confidence" value={item.confidence == null ? "Unknown" : `${Math.round(item.confidence * 100)}%`} />
      </dl>

      {item.safeNextStep ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Safe next step</p>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-900">{item.safeNextStep}</p>
        </div>
      ) : null}

      <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-800">Evidence and drill-down references</summary>
        <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
          <ReferenceList title="Evidence" values={item.evidenceRefs} empty="No evidence reference is attached." />
          <ReferenceList title="Affected records" values={drillDownRefs} empty="No canonical drill-down reference is attached." />
        </div>
      </details>
    </article>
  );
}

export function LiveIntelligenceFeedV1({ feed, sourceStatus = "AVAILABLE" }: { feed: LiveIntelligenceFeedModelV1; sourceStatus?: "AVAILABLE" | "UNAVAILABLE" }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-[#f8fafc] p-4 shadow-sm sm:p-5" aria-label="Live Intelligence Feed" data-testid="live-intelligence-feed-v1" data-visual-mode="light">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Intelligence terminal</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Live Intelligence Feed</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Material changes only. Routine activity, duplicates, stale replacements, and unsupported causal claims stay out of the executive signal.</p>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-label="Live intelligence summary">
          <Metric label="Material" value={String(feed.summary.surfaced)} />
          <Metric label="Immediate" value={String(feed.summary.immediate)} />
          <Metric label="Verify" value={String(feed.summary.verificationRequired)} />
        </div>
      </header>

      {sourceStatus === "UNAVAILABLE" ? (
        <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-5" data-testid="live-intelligence-unavailable">
          <h3 className="font-semibold text-amber-950">Live intelligence is unavailable</h3>
          <p className="mt-2 text-sm leading-6 text-amber-900">No synthetic or stale feed is shown in place of unavailable canonical evidence.</p>
        </div>
      ) : feed.items.length === 0 ? (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-5" data-testid="live-intelligence-empty">
          <h3 className="font-semibold text-slate-950">No material change</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">The feed is quiet because no supported material update survived the noise and duplicate filters.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">{feed.items.map((item) => <FeedCard key={item.feedItemId} item={item} />)}</div>
      )}
    </section>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{metricLabel}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}

function ReferenceList({ title, values, empty }: { title: string; values: readonly string[]; empty: string }) {
  return <div><p className="font-semibold text-slate-800">{title}</p>{values.length ? <ul className="mt-1 list-disc space-y-1 pl-4">{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p className="mt-1 text-amber-800">{empty}</p>}</div>;
}

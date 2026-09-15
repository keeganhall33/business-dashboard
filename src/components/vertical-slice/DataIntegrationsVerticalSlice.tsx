import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import {
  buildDataConfidenceModel,
  type ConfidenceEntry,
  type ConfidenceState
} from "@/lib/data-confidence";
import { Pill, VerticalSliceCard } from "./VerticalSliceCard";

const SOURCE_LABELS: Partial<Record<ConfidenceEntry["id"], string>> = {
  woo: "Sales",
  ga4: "Website traffic",
  meta: "Meta ads",
  funnelkit: "Checkout funnel",
  pipeline: "Opportunities",
  customer: "Customer history",
  industry: "Market intelligence"
};

const SOURCE_ORDER: ConfidenceEntry["id"][] = [
  "woo",
  "ga4",
  "meta",
  "funnelkit",
  "pipeline",
  "customer",
  "industry"
];

const STATE_LABELS: Record<ConfidenceState, string> = {
  trusted: "Ready",
  usable_with_caveats: "Limited",
  stale: "Needs refresh",
  conflicting: "Conflicting",
  insufficient_evidence: "Not ready",
  unavailable: "Not connected"
};

function stateTone(state: ConfidenceState) {
  if (state === "trusted") return "emerald" as const;
  if (state === "usable_with_caveats" || state === "stale" || state === "conflicting") return "amber" as const;
  return "rose" as const;
}

function formatVerifiedDate(value: string | null) {
  if (!value) return "No verified update";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Update date unavailable";
  return `Verified ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  }).format(parsed)}`;
}

function sourceSummary(entry: ConfidenceEntry) {
  if (entry.state === "trusted") return "Available for decisions and answers.";
  if (entry.state === "usable_with_caveats") return "Useful, but some totals or comparisons may be incomplete.";
  if (entry.state === "stale") return "The latest information is too old to rely on without review.";
  if (entry.state === "conflicting") return "Two sources disagree. Confirm the numbers before acting.";
  if (entry.state === "unavailable") return "No usable data is reaching the dashboard.";
  return "There is not enough verified information to use this source yet.";
}

export function DataIntegrationsVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  const confidence = buildDataConfidenceModel(data);
  const sources = SOURCE_ORDER.map((id) => confidence.entries.find((entry) => entry.id === id)).filter(
    (entry): entry is ConfidenceEntry => Boolean(entry)
  );
  const readyCount = sources.filter((entry) => entry.state === "trusted").length;
  const limitedCount = sources.filter((entry) =>
    ["usable_with_caveats", "stale", "conflicting"].includes(entry.state)
  ).length;
  const blockedCount = sources.length - readyCount - limitedCount;
  const priorities = sources
    .filter((entry) => entry.state !== "trusted")
    .sort((a, b) => a.confidenceScore - b.confidenceScore)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div className="max-w-2xl space-y-3">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">Current data confidence</div>
            <h2 className="text-2xl font-semibold sm:text-3xl">{confidence.overall.label}</h2>
            <p className="text-base leading-7 text-slate-300">
              {blockedCount > 0
                ? `${blockedCount} core ${blockedCount === 1 ? "source is" : "sources are"} not ready, so some answers and recommendations remain limited.`
                : limitedCount > 0
                  ? `${limitedCount} core ${limitedCount === 1 ? "source needs" : "sources need"} review before every recommendation can be trusted.`
                  : "All core business sources are ready for decisions and answers."}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <dt className="text-xs font-medium text-slate-300">Ready</dt>
              <dd className="mt-1 text-2xl font-semibold">{readyCount}</dd>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <dt className="text-xs font-medium text-slate-300">Limited</dt>
              <dd className="mt-1 text-2xl font-semibold">{limitedCount}</dd>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <dt className="text-xs font-medium text-slate-300">Not ready</dt>
              <dd className="mt-1 text-2xl font-semibold">{blockedCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      {priorities.length ? (
        <VerticalSliceCard title="Fix next" subtitle="The data improvements that will unlock the most useful answers and decisions.">
          <div className="grid gap-3 lg:grid-cols-3">
            {priorities.map((entry, index) => (
              <article key={entry.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">Priority {index + 1}</div>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">{entry.recommendedAction ?? `Verify ${SOURCE_LABELS[entry.id] ?? entry.label}`}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">Unlocks {entry.executiveImpact.toLowerCase()}.</p>
              </article>
            ))}
          </div>
        </VerticalSliceCard>
      ) : null}

      <VerticalSliceCard title="Business sources" subtitle="Only the sources that directly affect business answers and recommendations are shown here.">
        <div className="grid gap-3 md:grid-cols-2">
          {sources.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">{SOURCE_LABELS[entry.id] ?? entry.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{sourceSummary(entry)}</p>
                </div>
                <Pill tone={stateTone(entry.state)}>{STATE_LABELS[entry.state]}</Pill>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-500">
                {formatVerifiedDate(entry.lastVerified)}
              </div>
            </article>
          ))}
        </div>
      </VerticalSliceCard>

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="text-lg font-semibold text-slate-950">Important gaps</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <div className="font-semibold text-slate-950">Email performance</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">Campaign, automation, and revenue results are not connected yet.</p>
          </div>
          <div>
            <div className="font-semibold text-slate-950">Ad-to-sale attribution</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">Meta activity cannot yet be reliably tied to completed sales.</p>
          </div>
          <div>
            <div className="font-semibold text-slate-950">Customer matching</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">Traffic, campaigns, customers, and purchases are not fully joined.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

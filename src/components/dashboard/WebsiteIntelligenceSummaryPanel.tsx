import type {
  WebsiteIntelligenceSummaryFixtureV1,
  WebsiteOpportunityFixtureV1
} from "@/lib/dashboard/website-intelligence-summary-fixture";

type Props = {
  snapshot: WebsiteIntelligenceSummaryFixtureV1;
};

function formatPacificTimestamp(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} PDT`;
}

function valueOrUnknown(n: number | null) {
  return n == null ? "Unknown" : String(n);
}

export function WebsiteIntelligenceSummaryPanel({ snapshot }: Props) {
  return (
    <section id="website-intelligence" className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="ui-status-dot" data-tone={snapshot.state === "OK" ? "emerald" : "amber"} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Website intelligence</div>
            <div className="mt-1 text-lg font-semibold text-zinc-50">{snapshot.state === "OK" ? "OK" : "Unknown"}</div>
            <p className="mt-1 text-sm text-zinc-400">Read-only summary (fixtures). No crawling, publishing, or edits implied.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">READ_ONLY</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">MUTATION_DISABLED</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">
            Captured {formatPacificTimestamp(snapshot.capturedAt)}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Pages" value={valueOrUnknown(snapshot.pageCount)} />
          <MetricCard label="Broken links" value={valueOrUnknown(snapshot.brokenLinkCount)} />
          <MetricCard label="Missing alt" value={valueOrUnknown(snapshot.missingAltCount)} detail="Image accessibility" />
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Top opportunities</div>
          <div className="mt-3 grid gap-3">
            {snapshot.topOpportunities.slice(0, 3).map((opp) => (
              <OpportunityRow key={opp.id} opp={opp} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-zinc-50">{value}</div>
      {detail ? <div className="mt-1 text-xs text-zinc-400">{detail}</div> : null}
    </div>
  );
}

function OpportunityRow({ opp }: { opp: WebsiteOpportunityFixtureV1 }) {
  const tone = opp.severity === "high" ? "rose" : opp.severity === "medium" ? "amber" : opp.severity === "low" ? "zinc" : "zinc";
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-status-dot" data-tone={tone} />
        <div className="text-sm font-semibold text-zinc-50">{opp.title}</div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-400">{opp.severity}</div>
      </div>
      <div className="mt-1 text-xs text-zinc-400">{opp.detail}</div>
    </div>
  );
}

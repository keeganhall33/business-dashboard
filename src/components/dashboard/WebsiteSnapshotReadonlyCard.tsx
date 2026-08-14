import type { WebsiteSnapshotReadonlyFixtureV1 } from "@/lib/dashboard/website-snapshot-readonly-fixture";

type Props = {
  snapshot: WebsiteSnapshotReadonlyFixtureV1;
};

function formatPacificTimestamp(iso: string) {
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

export function WebsiteSnapshotReadonlyCard({ snapshot }: Props) {
  const capturedAt = snapshot.capturedAt ? formatPacificTimestamp(snapshot.capturedAt) : "—";

  const valueOrUnknown = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "Unknown");

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="ui-status-dot" data-tone={snapshot.state === "OK" ? "emerald" : "amber"} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Website snapshot</div>
            <div className="mt-1 text-lg font-semibold text-zinc-50">{snapshot.state === "OK" ? "OK" : "Unknown"}</div>
            <p className="mt-1 text-sm text-zinc-400">Read-only preview. No publishing, edits, or crawling implied.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">READ_ONLY</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">MUTATION_DISABLED</span>
          <span className="rounded-full border border-white/10 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-zinc-200">Captured {capturedAt}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Pages" value={valueOrUnknown(snapshot.pageCount)} />
          <MetricCard
            label="Changed pages"
            value={valueOrUnknown(snapshot.changedPageCount)}
            detail="Versus previous snapshot"
          />
          <MetricCard label="Broken links" value={valueOrUnknown(snapshot.brokenLinkCount)} />
          <MetricCard label="Missing alt" value={valueOrUnknown(snapshot.missingAltCount)} detail="Image accessibility" />
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

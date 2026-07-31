import type { DashboardTruthState } from "@/lib/dashboard/truth-state";

export function DataLimitationsBanner({ truth }: { truth: DashboardTruthState }) {
  if (!truth.degraded.active) return null;

  const unavailable = truth.degraded.unavailableDomains.map((d) => d.label);
  const stillWorks = truth.degraded.stillWorks.map((d) => d.consequence.summary);

  const decisions = truth.degraded.consequence.decisionsAffected;
  const next = truth.degraded.nextAction;

  return (
    <section className="rounded-3xl border border-amber-400/25 bg-amber-500/5 p-5 sm:p-6">
      <div className="text-xs font-semibold text-amber-200">Limited reporting</div>

      <div className="mt-2 space-y-2 text-sm text-zinc-200">
        <div>
          <span className="font-semibold text-white">Unavailable:</span> {unavailable.length ? unavailable.join(", ") : ""}
        </div>
        {stillWorks.length ? (
          <div>
            <span className="font-semibold text-white">Still works:</span> {stillWorks.join(" ")}
          </div>
        ) : null}
        <div>
          <span className="font-semibold text-white">Why you should care:</span> {truth.degraded.consequence.summary}
        </div>
        {decisions.length ? (
          <div className="text-zinc-300">
            <span className="font-semibold text-white">Decisions affected:</span> {decisions.slice(0, 2).join(" ")}
          </div>
        ) : null}
      </div>

      {next?.href ? (
        <div className="mt-4">
          {next.detail ? <div className="mb-2 text-sm text-amber-100">{next.detail}</div> : null}
          <a
            href={next.href}
            className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/15"
          >
            {next.title}
          </a>
        </div>
      ) : next?.title ? (
        <div className="mt-4 text-sm text-amber-100">Next: {next.title}</div>
      ) : null}
    </section>
  );
}

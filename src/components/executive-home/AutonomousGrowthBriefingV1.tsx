import type { AutonomousGrowthBriefingV1 } from "@/lib/executive-home/autonomous-growth-briefing-v1";

function statusCopy(briefing: AutonomousGrowthBriefingV1): string {
  if (briefing.status === "LIVE") {
    return "Your current priorities have enough verified support to brief you. You still approve consequential actions.";
  }
  if (briefing.status === "STALE") {
    return "This briefing needs fresher data before it can confidently recommend what to do next.";
  }
  return "The Chief of Staff briefing is still connecting the decision data it needs. Other strategy sections can continue working while this comes online.";
}

function truthLabel(state: string) {
  return state === "KNOWN" ? "Supported" : state.toLowerCase().replaceAll("_", " ");
}

export function AutonomousGrowthBriefingV1({
  briefing,
  embedded = false,
}: {
  briefing: AutonomousGrowthBriefingV1;
  embedded?: boolean;
}) {
  const live = briefing.status === "LIVE";

  return (
    <section
      data-testid="autonomous-growth-briefing"
      className={embedded ? "" : "mx-auto mt-5 max-w-7xl px-4 sm:px-6 lg:px-8"}
      aria-label="Chief of staff briefing"
    >
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Autonomous Growth OS</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">Chief of staff briefing</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">{statusCopy(briefing)}</p>
          </div>
          {embedded ? (
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Briefing only</span>
          ) : (
            <a href="/strategy" className="text-sm font-semibold text-slate-800 underline underline-offset-4">
              Open Strategy
            </a>
          )}
        </div>

        {!live ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                {briefing.status}
              </span>
              {briefing.issues.slice(0, 3).map((issue) => (
                <span key={issue} className="text-xs text-slate-500">{issue}</span>
              ))}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{briefing.northStarTrajectory.summary}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1.5fr_1fr]">
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Needs you now</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{briefing.needsKeegan.length}</p>
                {briefing.needsKeegan.length === 0 ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">No selected item currently appears in the canonical Keegan decision queue.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {briefing.needsKeegan.slice(0, 3).map((item) => (
                      <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">#{item.rank}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.nextStep}</p>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{truthLabel(item.evidenceState)} evidence</p>
                      </li>
                    ))}
                  </ol>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Selected portfolio</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Priorities that fit the current evidence and available capacity.</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{briefing.selectedPortfolio.length} shown</span>
                </div>
                <ol className="mt-3 divide-y divide-slate-200">
                  {briefing.selectedPortfolio.map((item) => (
                    <li key={item.id} className="grid gap-1 py-3 sm:grid-cols-[2rem_1fr_auto] sm:items-start sm:gap-3">
                      <span className="text-sm font-semibold text-slate-400">{item.rank}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.rationale}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:justify-end">
                        <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">{item.owner}</span>
                        <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600">{item.candidateType}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delegated safely</p>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <dt className="text-xs text-slate-500">Jeeves</dt>
                    <dd className="mt-1 text-2xl font-semibold text-slate-950">{briefing.delegated.JEEVES.length}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <dt className="text-xs text-slate-500">Ioana</dt>
                    <dd className="mt-1 text-2xl font-semibold text-slate-950">{briefing.delegated.IOANA.length}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-slate-600">These items have an owner, but that does not mean the work has started or finished yet.</p>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-900">North Star trajectory</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Not enough evidence yet to show a reliable trajectory.</p>
                </div>
              </article>
            </div>

            {(briefing.materialChanges.length > 0 || briefing.opportunityCost.length > 0) && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">What materially changed</p>
                  {briefing.materialChanges.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">No supported material portfolio change is attached to this briefing.</p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      {briefing.materialChanges.slice(0, 5).map((change, index) => (
                        <li key={`${change.kind}:${change.candidateId}:${index}`}>{change.summary}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs leading-5 text-slate-500">Observed state differences only. Cause attribution is not established.</p>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Opportunity cost</p>
                  <ol className="mt-3 space-y-2">
                    {briefing.opportunityCost.slice(0, 4).map((item) => (
                      <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{item.disposition}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.exclusionReason ?? "No supported exclusion reason was recorded."}</p>
                      </li>
                    ))}
                  </ol>
                </article>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

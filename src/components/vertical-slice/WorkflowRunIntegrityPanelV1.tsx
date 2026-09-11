import type { ExplainWorkflowRunSummary } from "@/lib/intelligence/explanation-contract";
import { DefinitionRow, Pill, VerticalSliceCard } from "./VerticalSliceCard";

const MAX_DETAIL_NODES = 24;
const MAX_DETAIL_WAVES = 8;
const MAX_SOURCE_LABELS = 8;

function isHealthy(summary: ExplainWorkflowRunSummary) {
  return (
    summary.state === "COMPLETE" &&
    summary.verifier.state === "PASSED" &&
    summary.verifier.failedLenses.length === 0 &&
    summary.anchors.passedCount >= summary.anchors.requiredCount &&
    summary.anchors.rejectedCanonicalRefs.length === 0 &&
    summary.missingBranches.length === 0 &&
    summary.failedBranches.length === 0
  );
}

function statusTone(summary: ExplainWorkflowRunSummary) {
  if (isHealthy(summary)) return "emerald" as const;
  if (summary.state === "PARTIAL" || summary.state === "DEGRADED") return "amber" as const;
  return "rose" as const;
}

function truthTone(state: ExplainWorkflowRunSummary["nodes"][number]["truthState"]) {
  if (state === "CURRENT") return "emerald" as const;
  if (state === "STALE" || state === "CONFLICTED") return "rose" as const;
  if (state === "UNKNOWN") return "amber" as const;
  return "zinc" as const;
}

function formatDuration(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "UNKNOWN";
  if (value < 1000) return value + " ms";
  return (value / 1000).toFixed(1) + " s";
}

function formatCost(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "UNKNOWN";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(value);
}

function trustStatement(summary: ExplainWorkflowRunSummary) {
  if (isHealthy(summary)) {
    return "All expected branches, independent verification, and mandatory anchors passed.";
  }
  if (summary.state === "PARTIAL") {
    return "This explanation is incomplete because one or more expected evidence branches are missing.";
  }
  if (summary.state === "DEGRADED") {
    return "Evidence is present, but a verification, anchor, freshness, or conflict condition limits trust.";
  }
  if (summary.state === "BLOCKED") {
    return "A mandatory dependency or trust check blocked a reliable explanation.";
  }
  return "The workflow failed and this explanation must not be treated as verified.";
}

function primaryLimitation(summary: ExplainWorkflowRunSummary) {
  if (summary.failedBranches.length) return "Failed branch: " + summary.failedBranches[0];
  if (summary.missingBranches.length) return "Missing branch: " + summary.missingBranches[0];
  if (summary.anchors.rejectedCanonicalRefs.length) {
    return summary.anchors.rejectedCanonicalRefs.length + " mandatory anchor reference(s) were rejected.";
  }
  if (summary.verifier.state === "FAILED") {
    return "Independent verification failed: " + (summary.verifier.failedLenses[0] ?? "unspecified lens") + ".";
  }
  if (summary.verifier.state === "UNKNOWN") return "Independent verification status is UNKNOWN.";
  if (summary.evidenceCoverage.missingSources.length) {
    return "Missing source: " + summary.evidenceCoverage.missingSources[0] + ".";
  }
  if (summary.budget.state === "EXCEEDED") return "The declared workflow budget was exceeded.";
  const nonCurrent = summary.nodes.find((node) => node.truthState !== "CURRENT");
  if (nonCurrent) return nonCurrent.nodeId + " evidence is " + nonCurrent.truthState + ".";
  return "Workflow integrity is not fully verified.";
}

function sourceList(values: string[]) {
  if (!values.length) return "None";
  const visible = values.slice(0, MAX_SOURCE_LABELS);
  const suffix = values.length > visible.length ? " +" + (values.length - visible.length) + " more" : "";
  return visible.join(", ") + suffix;
}

export function WorkflowRunIntegrityPanelV1({ summary }: { summary: ExplainWorkflowRunSummary | null | undefined }) {
  if (!summary) {
    return (
      <VerticalSliceCard
        title="Workflow integrity"
        subtitle="Trust context for this explanation."
      >
        <div data-testid="workflow-integrity-unavailable" className="text-sm text-zinc-400">
          Workflow integrity unavailable for this explanation. No workflow summary was supplied.
        </div>
      </VerticalSliceCard>
    );
  }

  const waves = summary.plannedWaves.slice(0, MAX_DETAIL_WAVES);
  const nodesById = new Map(summary.nodes.map((node) => [node.nodeId, node]));
  let renderedNodeCount = 0;

  return (
    <VerticalSliceCard
      title="Workflow integrity"
      subtitle="Read-only trust summary from the canonical explanation workflow run."
    >
      <div data-testid="workflow-integrity-panel" className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={statusTone(summary)}>Run status: {summary.state}</Pill>
              <Pill tone={summary.verifier.state === "PASSED" ? "emerald" : summary.verifier.state === "FAILED" ? "rose" : "amber"}>
                Verifier: {summary.verifier.state}
              </Pill>
              <Pill tone={summary.budget.state === "EXCEEDED" ? "rose" : summary.budget.state === "WITHIN_BUDGET" ? "emerald" : "zinc"}>
                Budget: {summary.budget.state}
              </Pill>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-zinc-200">{trustStatement(summary)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left sm:min-w-48 sm:text-right">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Evidence coverage</div>
            <div className="mt-1 text-xl font-semibold text-white">
              {summary.acceptedNodeCount} / {summary.expectedNodeCount}
            </div>
            <div className="text-xs text-zinc-400">accepted / expected branches</div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <DefinitionRow
            label="Anchor health"
            value={summary.anchors.passedCount + " / " + summary.anchors.requiredCount + " passed"}
          />
          <DefinitionRow label="Observed elapsed" value={formatDuration(summary.observedTiming.elapsedMs)} />
          <DefinitionRow label="Cost" value={formatCost(summary.budget.costUsd)} />
          <DefinitionRow label="Provider" value="UNKNOWN (not supplied)" />
        </div>

        <div
          data-testid="workflow-integrity-limitation"
          className={isHealthy(summary) ? "rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4" : "rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4"}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {isHealthy(summary) ? "Trust result" : "Most important limitation"}
          </div>
          <div className="mt-1 text-sm text-zinc-200">
            {isHealthy(summary) ? "No material workflow-integrity limitation reported." : primaryLimitation(summary)}
          </div>
        </div>

        <details data-testid="workflow-integrity-details" className="group rounded-2xl border border-white/10 bg-black/20">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            Show bounded workflow detail
          </summary>
          <div className="space-y-5 border-t border-white/10 p-4">
            <section aria-labelledby="workflow-inputs-heading">
              <h3 id="workflow-inputs-heading" className="text-sm font-semibold text-white">Evidence inputs</h3>
              <div className="mt-2 space-y-1 text-xs text-zinc-400">
                <div>Expected: {sourceList(summary.evidenceCoverage.expectedSources)}</div>
                <div>Observed: {sourceList(summary.evidenceCoverage.observedSources)}</div>
                <div>Missing: {sourceList(summary.evidenceCoverage.missingSources)}</div>
                <div>Duplicate evidence rejected: {summary.evidenceCoverage.duplicateEvidenceCount}</div>
              </div>
            </section>

            <section aria-labelledby="workflow-verifier-heading">
              <h3 id="workflow-verifier-heading" className="text-sm font-semibold text-white">Verification and anchors</h3>
              <div className="mt-2 space-y-1 text-xs text-zinc-400">
                <div>Verifier lenses failed: {summary.verifier.failedLenses.length ? summary.verifier.failedLenses.join(", ") : "None"}</div>
                <div>Rejected canonical references: {summary.anchors.rejectedCanonicalRefs.length}</div>
                <div>Unique evidence identities: {summary.anchors.uniqueEvidenceIdentityCount}</div>
              </div>
            </section>

            <section aria-labelledby="workflow-waves-heading">
              <h3 id="workflow-waves-heading" className="text-sm font-semibold text-white">Planned stages</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Planned stages show dependency eligibility only. They do not claim observed concurrency.
              </p>
              <div className="mt-3 space-y-3">
                {waves.map((wave) => {
                  const remaining = Math.max(0, MAX_DETAIL_NODES - renderedNodeCount);
                  const nodeIds = wave.nodeIds.slice(0, remaining);
                  renderedNodeCount += nodeIds.length;
                  if (!nodeIds.length) return null;
                  return (
                    <div key={wave.index} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                        Stage {wave.index + 1}
                      </h4>
                      <ul className="mt-2 space-y-2">
                        {nodeIds.map((nodeId) => {
                          const node = nodesById.get(nodeId);
                          if (!node) {
                            return <li key={nodeId} className="text-xs text-rose-200">{nodeId}: result MISSING</li>;
                          }
                          return (
                            <li key={node.nodeId} className="flex flex-col gap-1 rounded-lg border border-white/5 p-2 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-xs font-medium text-zinc-200">{node.nodeId}</span>
                              <span className="flex flex-wrap items-center gap-2">
                                <Pill tone={node.state === "ACCEPTED" ? "emerald" : node.state === "REJECTED" ? "rose" : "amber"}>
                                  {node.state}
                                </Pill>
                                <Pill tone={truthTone(node.truthState)}>{node.truthState}</Pill>
                                <span className="text-xs text-zinc-500">{node.evidenceCount} evidence item(s)</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {summary.nodes.length > renderedNodeCount || summary.plannedWaves.length > waves.length ? (
                <div className="mt-3 text-xs text-zinc-500">
                  Additional workflow detail omitted to keep this executive view bounded.
                </div>
              ) : null}
            </section>
          </div>
        </details>
      </div>
    </VerticalSliceCard>
  );
}

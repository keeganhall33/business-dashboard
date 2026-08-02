import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { buildExecutiveActions } from "@/lib/dashboard/executive-layout";
import { buildDataConfidenceModel } from "@/lib/data-confidence";
import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";

type RankInputs = {
  impact: number;
  confidence: number;
  effort: number;
  risk: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function scoreRecommendation({ impact, confidence, effort, risk }: RankInputs) {
  // Transparent baseline ranking: impact × confidence ÷ (effort+risk)
  const denom = Math.max(0.25, effort + risk);
  return (impact * confidence) / denom;
}

function mapConfidenceLabel(label: string) {
  const v = label.toLowerCase();
  if (v.includes("high")) return 0.9;
  if (v.includes("medium")) return 0.6;
  if (v.includes("low")) return 0.35;
  return 0.5;
}

function approvalClassesFor(actionId: string) {
  if (actionId.startsWith("marketing-") || actionId.includes("meta")) return ["content", "audience", "financial", "publication"];
  if (actionId.startsWith("pipeline-")) return ["audience", "customer_contact"];
  if (actionId.startsWith("telemetry-") || actionId === "scheduler") return ["data_system"];
  return ["informational"];
}

export function RecommendVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  const confidence = buildDataConfidenceModel(data);
  const actions = buildExecutiveActions(data, 12, confidence);

  const ranked = actions
    .map((action) => {
      const impact = clamp01(action.priority === "P1" ? 0.9 : action.priority === "P2" ? 0.65 : 0.45);
      const conf = mapConfidenceLabel(action.confidence);
      const effort = clamp01(action.id.startsWith("telemetry-") || action.id === "scheduler" ? 0.4 : 0.6);
      const risk = clamp01(action.id.startsWith("marketing-") ? 0.7 : 0.4);
      const score = scoreRecommendation({ impact, confidence: conf, effort, risk });
      return { action, score, effort, risk, impact, conf };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      <VerticalSliceCard
        title="Recommendations (read-only)"
        subtitle="Ranked from real current evidence. Nothing is executed from this view."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="sky">Ranking: impact × confidence ÷ (effort + risk)</Pill>
          <Pill tone="amber">No email telemetry • No matchback • No identity resolution</Pill>
          <Pill tone="zinc">Approvals required before any execution (L4 disabled)</Pill>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Top next actions" subtitle="Each item includes evidence, limitations, required approvals, and how success would be measured.">
        {ranked.length ? (
          <div className="space-y-3">
            {ranked.map(({ action, score, effort, risk, impact, conf }) => (
              <div key={action.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {action.priority} — {action.title}
                    </div>
                    <div className="text-xs text-zinc-400">Owner: {action.owner ?? "—"} • Due: {action.due ?? "—"}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Pill tone={action.priority === "P1" ? "rose" : action.priority === "P2" ? "amber" : "zinc"}>{`Score ${score.toFixed(2)}`}</Pill>
                    <Pill tone="zinc">Conf {action.confidence}</Pill>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Reason + evidence</div>
                    <div className="mt-2 text-sm text-zinc-200">{action.impact}</div>
                    <div className="mt-2 text-sm text-zinc-400">Evidence: {action.evidence}</div>
                    {action.confidenceDetail ? <div className="mt-2 text-xs text-zinc-500">Confidence detail: {action.confidenceDetail}</div> : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Approvals + measurement</div>
                    <DefinitionRow label="Required approvals" value={(approvalClassesFor(action.id) || []).join(", ")} />
                    <DefinitionRow label="Effort (proxy)" value={effort.toFixed(2)} />
                    <DefinitionRow label="Risk (proxy)" value={risk.toFixed(2)} />
                    <DefinitionRow label="Expected impact (proxy)" value={impact.toFixed(2)} />
                    <DefinitionRow label="Confidence (proxy)" value={conf.toFixed(2)} />
                    <DefinitionRow label="Success metric" value="Net revenue, orders, conversion rate, or spend efficiency (depending on action)" />
                    <DefinitionRow label="Window" value="48h–14d depending on channel" />
                  </div>
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Missing data that could change this recommendation: email telemetry, matchback attribution, identity resolution, inventory history.
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No recommendations generated for this window (insufficient evidence or blocked sources).</div>
        )}
      </VerticalSliceCard>

      <VerticalSliceCard title="Safety" subtitle="No actions are executed. Any future L4 execution requires explicit approval and hash verification.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Recommendations are read-only (L1). Draft preparation may be shown in Act (L2/L3).</li>
          <li>L4 execution remains disabled for this milestone.</li>
          <li>All action payloads must be immutable after approval; edits require a new version + reapproval.</li>
        </ul>
      </VerticalSliceCard>
    </div>
  );
}

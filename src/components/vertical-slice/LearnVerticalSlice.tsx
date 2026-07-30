import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";

export function LearnVerticalSlice({ data }: { data: DashboardOverviewResponse }) {
  const feedbackStructure = {
    baseline: "previous comparable period",
    primaryMetric: "net revenue (Woo)",
    guardrails: ["unsubscribe rate (email once connected)", "refund rate", "ad spend"],
    window: "48h–14d",
    note: "Outcomes are architecture-scoped in this milestone; execution is disabled."
  };

  const hasAnyActions = (data.topActions?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <VerticalSliceCard title="Learn" subtitle="Minimal functional view: shows outcome structure and where measurement will plug in.">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="zinc">L5 measurement loop: planned</Pill>
          <Pill tone="amber">Execution disabled → outcomes limited</Pill>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Outcome measurement plan (template)" subtitle="Used after approved execution in future milestones.">
        <div className="space-y-2">
          <DefinitionRow label="Baseline" value={feedbackStructure.baseline} />
          <DefinitionRow label="Primary metric" value={feedbackStructure.primaryMetric} />
          <DefinitionRow label="Guardrails" value={feedbackStructure.guardrails.join(", ")} />
          <DefinitionRow label="Window" value={feedbackStructure.window} />
          <DefinitionRow label="Note" value={feedbackStructure.note} />
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="What we can learn today (without execution)" subtitle="Signals still measurable from the existing telemetry stack.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Whether revenue/orders are trending up/down versus prior period.</li>
          <li>Whether ad spend efficiency is improving or degrading (limited by matchback).</li>
          <li>Whether traffic and funnel proxies are moving (GA4 snapshot limitations apply).</li>
          <li>Whether source freshness is deteriorating and recommendations should be suppressed.</li>
        </ul>
      </VerticalSliceCard>

      <VerticalSliceCard title="Current data" subtitle="Shows whether the system has enough evidence to propose next steps.">
        <div className="text-sm text-zinc-300">Top actions available: {hasAnyActions ? "Yes" : "No"}</div>
      </VerticalSliceCard>
    </div>
  );
}

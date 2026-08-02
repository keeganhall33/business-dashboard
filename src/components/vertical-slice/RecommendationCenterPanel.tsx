import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";
import type { RecommendationsResponse, Recommendation } from "@/lib/intelligence/recommendation-contract";

function toneForConfidence(c: string) {
  if (c === "confirmed" || c === "strongly_supported") return "emerald" as const;
  if (c === "likely") return "amber" as const;
  if (c === "possible") return "zinc" as const;
  return "rose" as const;
}

function fmtMoney(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function renderRec(rec: Recommendation) {
  return (
    <div key={rec.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{rec.title}</div>
          <div className="text-xs text-zinc-400">
            {rec.category.replace(/_/g, " ")} • {rec.approval_level} • {rec.status}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Pill tone={toneForConfidence(rec.confidence)}>{rec.confidence.replace(/_/g, " ")}</Pill>
          <Pill tone={rec.priority_score.overallScore >= 70 ? "rose" : rec.priority_score.overallScore >= 50 ? "amber" : "zinc"}>
            Score {rec.priority_score.overallScore}
          </Pill>
        </div>
      </div>

      <div className="mt-3 text-sm text-zinc-300">Action: {rec.recommended_action}</div>
      <div className="mt-2 text-sm text-zinc-400">Why: {rec.reason}</div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Expected impact</div>
          <div className="mt-2 space-y-2">
            <DefinitionRow label="Low" value={fmtMoney(rec.estimated_incremental_revenue.low_incremental_revenue_cents)} />
            <DefinitionRow label="Expected" value={fmtMoney(rec.estimated_incremental_revenue.expected_incremental_revenue_cents)} />
            <DefinitionRow label="High" value={fmtMoney(rec.estimated_incremental_revenue.high_incremental_revenue_cents)} />
            <DefinitionRow label="Horizon" value={rec.estimated_incremental_revenue.horizon} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Risk / effort</div>
          <div className="mt-2 space-y-2">
            <DefinitionRow label="Risk" value={rec.risk} />
            <DefinitionRow label="Effort" value={rec.estimated_effort.level} />
            <DefinitionRow label="Time to impact" value={rec.time_to_impact} />
            <DefinitionRow label="Cost" value={fmtMoney(rec.estimated_cost.money_cents)} />
          </div>
        </div>
      </div>

      {rec.prepared_assets.length ? (
        <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/5 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Drafts prepared (NOT APPROVED)</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-200">
            {rec.prepared_assets.map((a) => (
              <li key={a.id}>
                {a.label} — <span className="text-xs text-zinc-400">{a.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RecommendationCenterPanel({ payload }: { payload: RecommendationsResponse | null }) {
  if (!payload) {
    return (
      <VerticalSliceCard title="Recommendation Center" subtitle="Unavailable">
        <div className="text-sm text-zinc-500">No recommendations available for this range.</div>
      </VerticalSliceCard>
    );
  }

  const top = payload.recommendations.slice(0, 6);

  return (
    <div className="space-y-6">
      <VerticalSliceCard title="Recommendation Center" subtitle="Specific, ranked, evidence-backed recommendations (read-only).">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={payload.dataMode === "LIVE_DATA" ? "emerald" : payload.dataMode === "PARTIAL_LIVE_DATA" ? "amber" : "rose"}>
            {payload.dataMode ?? "UNAVAILABLE"}
          </Pill>
          <Pill tone="zinc">Formula: {payload.recommendations[0]?.priority_score.formula ?? "(see priority-scoring.ts)"}</Pill>
        </div>
        {payload.guardrailsTriggered.length ? (
          <div className="mt-3 text-xs text-zinc-500">Guardrails: {payload.guardrailsTriggered.join(" • ")}</div>
        ) : null}
      </VerticalSliceCard>

      <VerticalSliceCard title="Top recommendations" subtitle="Ranked by overall priority score (0–100).">
        <div className="space-y-3">{top.map(renderRec)}</div>
      </VerticalSliceCard>
    </div>
  );
}

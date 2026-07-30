import { VerticalSliceCard, Pill } from "./VerticalSliceCard";
import type { OpportunitiesResponse, Opportunity } from "@/lib/intelligence/recommendation-contract";

function toneForConfidence(c: string) {
  if (c === "confirmed" || c === "strongly_supported") return "emerald" as const;
  if (c === "likely") return "amber" as const;
  if (c === "possible") return "zinc" as const;
  return "rose" as const;
}

function scoreHint(opp: Opportunity) {
  const expected = opp.estimated_upside.expected_incremental_revenue_cents;
  if (expected == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(expected / 100);
}

function renderList(items: Opportunity[]) {
  return items.length ? (
    <div className="space-y-2">
      {items.map((o) => (
        <div key={o.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{o.title}</div>
              <div className="text-xs text-zinc-400">{o.type.replace(/_/g, " ")}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Pill tone={toneForConfidence(o.confidence)}>{o.confidence.replace(/_/g, " ")}</Pill>
              <Pill tone="zinc">Upside: {scoreHint(o)}</Pill>
            </div>
          </div>
          <div className="mt-2 text-sm text-zinc-300">Action: {o.recommended_action}</div>
          <div className="mt-2 text-xs text-zinc-500">Rule: {o.detection_rule}</div>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-sm text-zinc-500">None</div>
  );
}

export function OpportunityCenterPanel({ payload }: { payload: OpportunitiesResponse | null }) {
  if (!payload) {
    return (
      <VerticalSliceCard title="Opportunity Center" subtitle="Unavailable">
        <div className="text-sm text-zinc-500">No opportunities available for this range.</div>
      </VerticalSliceCard>
    );
  }

  const opps = payload.opportunities;
  const top = opps.slice(0, 5);
  const quickWins = opps.filter((o) => o.effort === "low").slice(0, 5);
  const risks = opps.filter((o) => ["attribution_blind_spot", "missing_data_connection", "unnecessary_spending"].includes(o.type)).slice(0, 5);
  const waiting = opps.filter((o) => o.type === "insufficient_evidence");

  return (
    <div className="space-y-6">
      <VerticalSliceCard title="Opportunity Center" subtitle="Ranked opportunities from evidence-backed explanations (read-only).">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={payload.dataMode === "LIVE_DATA" ? "emerald" : payload.dataMode === "PARTIAL_LIVE_DATA" ? "amber" : "rose"}>
            {payload.dataMode ?? "UNAVAILABLE"}
          </Pill>
          <Pill tone="zinc">No execution controls</Pill>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Top opportunities" subtitle="Highest expected value and confidence">
        {renderList(top)}
      </VerticalSliceCard>

      <VerticalSliceCard title="Quick wins" subtitle="Low effort, short time-to-impact">
        {renderList(quickWins)}
      </VerticalSliceCard>

      <VerticalSliceCard title="Risks and leaks" subtitle="Wasted spend, missing data, or attribution gaps">
        {renderList(risks)}
      </VerticalSliceCard>

      <VerticalSliceCard title="Waiting for data" subtitle="Blocked by insufficient evidence">
        {waiting.length ? renderList(waiting) : <div className="text-sm text-zinc-500">No blocked items.</div>}
      </VerticalSliceCard>
    </div>
  );
}


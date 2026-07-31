import { VerticalSliceCard, Pill, DefinitionRow } from "./VerticalSliceCard";
import type { ExplainResponse, ExplanationDriver } from "@/lib/intelligence/explanation-contract";

function formatCents(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatPct(pct: number | null | undefined) {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function toneForConfidence(c: string) {
  if (c === "confirmed" || c === "strongly_supported") return "emerald" as const;
  if (c === "likely") return "amber" as const;
  if (c === "possible") return "zinc" as const;
  return "rose" as const;
}

function DriverCard({ driver }: { driver: ExplanationDriver }) {
  const impact = driver.impactEstimate?.unit === "cents" ? formatCents(driver.impactEstimate.value) : formatPct(driver.impactEstimate?.value);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{driver.label}</div>
          <div className="text-xs text-zinc-400">
            {driver.direction} • {driver.magnitude}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Pill tone={toneForConfidence(driver.confidence)}>{driver.confidence.replace(/_/g, " ")}</Pill>
        </div>
      </div>

      <div className="mt-3 text-sm text-zinc-300">Impact (proxy): {impact}</div>
      {driver.confidenceReasons?.length ? <div className="mt-2 text-xs text-zinc-500">{driver.confidenceReasons.join(" • ")}</div> : null}
    </div>
  );
}

export function CausalExplanationPanel({ payload }: { payload: ExplainResponse | null }) {
  if (!payload) {
    return (
      <VerticalSliceCard title="Causal explanation engine" subtitle="Read-only: evidence-backed explanations are unavailable for this range.">
        <div className="text-sm text-zinc-400">Insufficient evidence or missing telemetry.</div>
      </VerticalSliceCard>
    );
  }

  const ex = payload.explanation;

  return (
    <div className="space-y-6">
      <VerticalSliceCard title="Causal explanation engine" subtitle="Read-only: quantified drivers, evidence, alternatives, and confidence.">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="sky">Metric: {ex.metric}</Pill>
          <Pill tone={payload.dataMode === "LIVE_DATA" ? "emerald" : payload.dataMode === "PARTIAL_LIVE_DATA" ? "amber" : "rose"}>
            {payload.dataMode ?? "UNAVAILABLE"}
          </Pill>
          <Pill tone="zinc">No email • No matchback • No identity resolution</Pill>
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="What happened" subtitle="Current vs comparison with explicit caveats.">
        <div className="space-y-2">
          <DefinitionRow label="Window" value={`${ex.current_period.startDate} → ${ex.current_period.endDate}`} />
          <DefinitionRow label="Comparison" value={`${ex.comparison_period.startDate} → ${ex.comparison_period.endDate}`} />
          <DefinitionRow label="Δ revenue" value={formatCents(ex.absolute_change)} />
          <DefinitionRow label="Δ %" value={formatPct(ex.percentage_change)} />
          <DefinitionRow
            label="Confidence"
            value={<Pill tone={toneForConfidence(ex.confidence)}>{ex.confidence.replace(/_/g, " ")}</Pill>}
          />
        </div>
        {ex.confidence_reasons?.length ? <div className="mt-3 text-xs text-zinc-500">{ex.confidence_reasons.join(" • ")}</div> : null}
      </VerticalSliceCard>

      <VerticalSliceCard title="Why it happened" subtitle="Ranked drivers with impact proxies and confidence.">
        <div className="space-y-3">
          {ex.primary_driver ? <DriverCard driver={ex.primary_driver} /> : null}
          {ex.contributing_drivers.map((d) => (
            <DriverCard key={d.id} driver={d} />
          ))}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Evidence" subtitle="Exact supporting metrics used by the engine.">
        <div className="space-y-2">
          {ex.evidence.slice(0, 12).map((ev) => (
            <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-sm font-semibold text-white">{ev.label}</div>
              <div className="text-xs text-zinc-500">
                {ev.source} • {ev.kind}
              </div>
            </div>
          ))}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="What else could explain it" subtitle="Competing hypotheses. We do not stop at the first correlation.">
        <div className="space-y-3">
          {ex.alternative_explanations.map((h) => (
            <div key={h.hypothesis} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white">{h.hypothesis}</div>
                <Pill tone={toneForConfidence(h.confidence)}>{h.conclusion}</Pill>
              </div>
              {h.evidence_for.length ? <div className="mt-2 text-sm text-zinc-300">For: {h.evidence_for.join(" • ")}</div> : null}
              {h.evidence_against.length ? (
                <div className="mt-2 text-sm text-zinc-400">Against: {h.evidence_against.join(" • ")}</div>
              ) : null}
            </div>
          ))}
        </div>
      </VerticalSliceCard>

      <VerticalSliceCard title="Missing data + next follow-ups" subtitle="The engine is explicit about what it cannot know.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Missing</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {ex.data_missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Follow-up</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {ex.recommended_follow_up.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </VerticalSliceCard>
    </div>
  );
}

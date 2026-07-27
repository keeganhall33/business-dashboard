import type { ExecutiveSummary } from "@/lib/dashboard/executive-summary";

type StatusTone = "emerald" | "amber" | "rose" | "zinc";

export function BusinessStatusPanel({ summary }: { summary: ExecutiveSummary | null }) {
  const status = summarize(summary);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 shadow-2xl shadow-black/40">
      <div className="text-[11px] font-semibold uppercase tracking-[0.4em] text-zinc-500">Business Status</div>
      <p className="mt-3 text-xl font-semibold text-white">{status.headline}</p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-400">
        <Badge label="Window" value={status.rangeLabel} />
        <Badge label="Comparison" value={status.comparisonLabel} />
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${tone(status.tone)}`}>{status.confidence}</span>
      </div>

      {status.detail ? <p className="mt-3 text-sm text-zinc-300">{status.detail}</p> : null}
    </section>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">{label}</span>
      <span className="rounded-full border border-white/10 px-2 py-1 text-zinc-100">{value}</span>
    </div>
  );
}

function summarize(summary: ExecutiveSummary | null) {
  if (!summary) {
    return {
      headline: "Insufficient evidence to summarize business performance for this window.",
      detail: "A comparable previous window is unavailable.",
      confidence: "Low confidence",
      tone: "zinc" as const,
      rangeLabel: "Unavailable",
      comparisonLabel: "Unavailable"
    };
  }

  const { revenue, orders, sessions, purchaseConversion, aov, funnelCompletion } = summary.metrics;

  const commerceIncomplete =
    (revenue.currentCompleteness && revenue.currentCompleteness !== "complete") ||
    (orders.currentCompleteness && orders.currentCompleteness !== "complete");

  const declines: string[] = [];
  const gains: string[] = [];

  const pushChange = (label: string, deltaPercent: number | null) => {
    if (deltaPercent == null) return;
    const pct = deltaPercent * 100;
    if (pct <= -10) declines.push(label);
    if (pct >= 10) gains.push(label);
  };

  if (!commerceIncomplete) {
    pushChange("revenue", revenue.deltaPercent);
    pushChange("orders", orders.deltaPercent);
  }
  pushChange("sessions", sessions.deltaPercent);
  pushChange("purchase conversion", purchaseConversion.deltaPercent);
  pushChange("AOV", aov.deltaPercent);
  pushChange("funnel completion", funnelCompletion.deltaPercent);

  const tone: StatusTone = commerceIncomplete ? "rose" : declines.length ? "rose" : gains.length ? "emerald" : "amber";
  const confidence = commerceIncomplete ? "Low confidence" : "Moderate confidence";

  const trafficMovedMaterially = typeof sessions.deltaPercent === "number" && Math.abs(sessions.deltaPercent) >= 0.1;

  const headline = commerceIncomplete
    ? trafficMovedMaterially
      ? "Traffic declined materially. Current Woo revenue and order totals are partial because selected-range telemetry is unavailable."
      : "Current Woo revenue and order totals are partial because selected-range telemetry is unavailable."
    : declines.length
      ? "Material declines in " + declines.slice(0, 3).join(", ") + " versus the prior comparable period."
      : gains.length
        ? "Material gains in " + gains.slice(0, 3).join(", ") + " versus the prior comparable period."
        : "No material movement detected versus the prior comparable period.";

  const mostImportant = commerceIncomplete ? null : pickMostMaterial(summary);
  const detail = mostImportant ? mostImportant : null;

  return {
    headline,
    detail,
    confidence,
    tone,
    rangeLabel: summary.rangeLabel,
    comparisonLabel: summary.comparisonLabel
  };
}

function pickMostMaterial(summary: ExecutiveSummary) {
  const candidates = Object.values(summary.metrics)
    .map((m) => ({ label: m.label, deltaPercent: m.deltaPercent }))
    .filter((m): m is { label: string; deltaPercent: number } => typeof m.deltaPercent === "number" && Number.isFinite(m.deltaPercent));

  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent));
  const top = candidates[0];
  const pct = (top.deltaPercent * 100).toFixed(1);
  return `${top.label} moved ${top.deltaPercent < 0 ? "down" : "up"} ${Math.abs(Number(pct)).toFixed(1)}% versus the comparison window.`;
}

function tone(t: StatusTone) {
  if (t === "emerald") return "text-emerald-300 border-emerald-500/30";
  if (t === "rose") return "text-rose-300 border-rose-500/40";
  if (t === "amber") return "text-amber-300 border-amber-500/40";
  return "text-zinc-300 border-white/10";
}

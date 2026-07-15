"use client";

import type { IndustryPulseSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

export function IndustryPulsePanel({ snapshot }: { snapshot?: IndustryPulseSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Industry pulse feed not available. Configure sources.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(snapshot.generatedAt);
  const alerts = prioritizeAlerts(snapshot.alerts ?? []);

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Industry Pulse</div>
          <div className="text-sm text-zinc-400">External opportunities from sports, music, sponsorship, and culture.</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200">No high-confidence alerts captured.</div>
      ) : (
        <div className="space-y-3">
          {alerts.slice(0, 6).map((alert, idx) => (
            <article key={`${alert.title}-${idx}`} className="rounded-2xl border border-white/8 bg-black/25 p-4 text-sm text-zinc-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{alert.title}</div>
                <StatusChip label={`${alert.category} • ${alert.urgency}`} tone={toneFromUrgency(alert.urgency)} />
              </div>
              <div className="mt-1 text-xs text-zinc-400">{alert.whyItMatters}</div>
              <div className="mt-2 text-xs text-zinc-300">Opportunity: {alert.opportunity}</div>
              <div className="text-xs text-zinc-300">Action: {alert.recommendedAction}</div>
              <div className="mt-1 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.3em] text-white/50">
                <span>Confidence: {alert.confidence}</span>
                {alert.owner ? <span>Owner: {alert.owner}</span> : null}
                {alert.sourceUrl ? (
                  <a href={alert.sourceUrl} className="text-sky-300 hover:text-sky-200" target="_blank" rel="noreferrer">
                    Source
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function toneFromUrgency(urgency: string) {
  if (urgency === 'high') return 'emerald';
  if (urgency === 'medium') return 'sky';
  return 'zinc';
}

function prioritizeAlerts(alerts: IndustryPulseSnapshot["alerts"]) {
  const scored = alerts
    .filter((alert) => alert && alert.whyItMatters && alert.recommendedAction && alert.confidence !== "low")
    .map((alert) => ({
      alert,
      score: (alert.confidence === "high" ? 2 : 1) + (alert.urgency === "high" ? 1 : 0)
    }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((entry) => entry.alert);
}

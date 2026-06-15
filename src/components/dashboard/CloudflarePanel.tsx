"use client";

import type { CloudflareTelemetrySnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { PanelWrapper } from "./ui/PanelWrapper";

export function CloudflarePanel({ snapshot }: { snapshot?: CloudflareTelemetrySnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="ui-glass rounded-3xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        Cloudflare telemetry not available yet.
      </section>
    );
  }

  const updated = formatRelativeTimeFromNow(snapshot.generatedAt);
  const cacheHitRate = snapshot.summary?.cacheHitRate ?? snapshot.traffic?.cacheHitRate ?? null;
  const cacheHealth = snapshot.summary?.cacheHealth ?? 'unknown';
  const trafficHealth = snapshot.summary?.trafficHealth ?? 'unknown';
  const warnings = snapshot.summary?.warnings ?? snapshot.warnings ?? [];
  const cacheMessage = cacheHitRate == null ? 'Cache data unavailable from GraphQL' : `Cache health: ${cacheHealth}`;
  const threatMessage = snapshot.security?.threats == null ? 'Threat telemetry unavailable' : `${snapshot.security.threats} threats detected`;

  return (
    <section className="ui-glass rounded-3xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Cloudflare / Site Health</div>
        <div className="text-sm text-zinc-400">Traffic, cache, and security status.</div>
        <div className="text-xs text-emerald-200/70">Mode: {snapshot.status?.mode ?? 'unknown'}</div>
        </div>
        <StatusChip label={`Updated ${updated}`} tone="zinc" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Traffic health" value={trafficHealth} description={`${snapshot.traffic?.requestsTotal ?? 0} requests`} />
        <MetricCard label="Cache hit rate" value={cacheHitRate ? `${(cacheHitRate * 100).toFixed(1)}%` : 'n/a'} description={cacheMessage} />
        <MetricCard label="Threat signals" value={snapshot.security?.threats ?? 'n/a'} description={threatMessage} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ListCard title="Warnings" items={warnings} empty="No warnings." tone="warning" />
        <ListCard
          title="Top paths"
          items={(snapshot.top?.paths ?? []).slice(0, 4).map((p) => `${p.path} – ${p.requests} req`)}
          empty="No path data."
        />
      </div>

      <ListCard
        title="Security signals"
        items={buildSecuritySignals(snapshot)}
        empty="No security events."
        tone="accent"
      />
    </section>
  );
}

function MetricCard({ label, value, description }: { label: string; value: number | string | null; description?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="text-xs uppercase tracking-[0.25em] text-white/60">{label}</div>
      <div className="text-2xl font-semibold text-white">{value ?? 'n/a'}</div>
      {description ? <div className="text-xs text-zinc-400">{description}</div> : null}
    </div>
  );
}

function ListCard({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: 'warning' | 'accent' }) {
  if (!items.length) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">{empty}</div>;
  }
  const toneClass = tone === 'warning' ? 'text-amber-200' : tone === 'accent' ? 'text-sky-200' : 'text-zinc-100';
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50">{title}</div>
      <ul className="mt-2 space-y-1">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`} className={toneClass}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildSecuritySignals(snapshot: CloudflareTelemetrySnapshot) {
  const list: string[] = [];
  if (snapshot.security?.botRequests != null) {
    list.push(`Bot requests: ${snapshot.security.botRequests}`);
  }
  if (snapshot.security?.blockedRequests != null) {
    list.push(`Blocked requests: ${snapshot.security.blockedRequests}`);
  }
  if (!list.length) {
    list.push('Live security signals unavailable from GraphQL dataset');
  }
  return list;
}

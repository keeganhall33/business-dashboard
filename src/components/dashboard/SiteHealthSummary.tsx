import type { CloudflareTelemetrySnapshot } from "@/lib/types/dashboard";

const STATUS_COPY: Record<string, string> = {
  healthy: "Healthy",
  needs_attention: "Needs attention",
  active: "Traffic active",
  quiet: "Traffic quiet"
};

export function SiteHealthSummary({ snapshot }: { snapshot?: CloudflareTelemetrySnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-white/5 bg-black/30 p-4 text-sm text-zinc-400">
        Site telemetry unavailable this range.
      </div>
    );
  }

  const availability = snapshot.summary?.trafficHealth ?? "unknown";
  const cacheHealth = snapshot.summary?.cacheHealth ?? "unknown";
  const securityPressure = snapshot.summary?.securityPressure ?? null;

  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Site reliability</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <HealthPill label="Availability" value={STATUS_COPY[availability] ?? availability} />
        <HealthPill label="Cache" value={STATUS_COPY[cacheHealth] ?? cacheHealth} />
        <HealthPill label="Security" value={securityPressure != null ? `${securityPressure.toFixed(1)} pressure` : "No incidents"} />
      </div>
    </div>
  );
}

function HealthPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/40 px-3 py-4 text-sm text-zinc-200">
      <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

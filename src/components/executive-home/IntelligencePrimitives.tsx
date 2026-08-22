import type { ApprovalStateV1, ConfidenceV1, FreshnessV1, IntelligencePriorityV1, IntelligenceStateV1, SpecialistDomainV1 } from "@/lib/executive-home/fixtures";

type BadgeTone = "stone" | "emerald" | "amber" | "rose" | "sky" | "violet";

const toneClass: Record<BadgeTone, string> = {
  stone: "border-stone-300 bg-stone-50 text-stone-800",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-800",
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  rose: "border-rose-300 bg-rose-50 text-rose-800",
  sky: "border-sky-300 bg-sky-50 text-sky-800",
  violet: "border-violet-300 bg-violet-50 text-violet-800"
};

export function LightBadge({ label, tone = "stone" }: { label: string; tone?: BadgeTone }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>{label}</span>;
}

export function VisualSignalPill({ label, value, tone = "stone" }: { label: string; value: string; tone?: BadgeTone }) {
  return (
    <div className={`rounded-2xl border p-3 ${toneClass[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

export function EvidenceBar({ label, tone = "stone", emphasis = "medium" }: { label: string; tone?: BadgeTone; emphasis?: "low" | "medium" | "high" }) {
  const width = emphasis === "high" ? "w-full" : emphasis === "medium" ? "w-2/3" : "w-1/3";
  const fill = {
    stone: "bg-stone-400",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
    violet: "bg-violet-500"
  }[tone];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-stone-600">
        <span>{label}</span>
        <span>{emphasis.toUpperCase()}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${fill} ${width}`} />
      </div>
    </div>
  );
}

export function stateTone(state: IntelligenceStateV1): BadgeTone {
  if (state === "FACT" || state === "ACTION") return "emerald";
  if (state === "RECOMMENDATION" || state === "INFERENCE" || state === "HYPOTHESIS") return "sky";
  if (state === "WARNING" || state === "STALE" || state === "UNKNOWN") return "amber";
  if (state === "CONFLICTED") return "rose";
  return "stone";
}

export function confidenceTone(confidence: ConfidenceV1): BadgeTone {
  if (confidence === "HIGH") return "emerald";
  if (confidence === "MEDIUM") return "sky";
  if (confidence === "LOW") return "amber";
  return "amber";
}

export function priorityTone(priority: IntelligencePriorityV1): BadgeTone {
  if (priority === "DO_NOW") return "rose";
  if (priority === "PREPARE") return "sky";
  return "stone";
}

export function approvalTone(approval: ApprovalStateV1): BadgeTone {
  if (approval === "KEEGAN_ACTION_REQUIRED" || approval === "BLOCKED") return "rose";
  if (approval === "APPROVED") return "emerald";
  return "stone";
}

export function freshnessTone(freshness: FreshnessV1): BadgeTone {
  if (freshness === "FRESH") return "emerald";
  if (freshness === "STALE") return "amber";
  return "amber";
}

export function domainTone(domain: SpecialistDomainV1): BadgeTone {
  if (domain === "STRATEGY") return "violet";
  if (domain === "FINANCIAL") return "emerald";
  if (domain === "CREATIVE") return "sky";
  if (domain === "EVIDENCE") return "amber";
  return "stone";
}

export function confidenceEmphasis(confidence: ConfidenceV1): "low" | "medium" | "high" {
  if (confidence === "HIGH") return "high";
  if (confidence === "MEDIUM") return "medium";
  return "low";
}

export function priorityEmphasis(priority: IntelligencePriorityV1): "low" | "medium" | "high" {
  if (priority === "DO_NOW") return "high";
  if (priority === "PREPARE") return "medium";
  return "low";
}

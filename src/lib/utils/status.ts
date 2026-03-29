import type { MetricStatus } from "@/lib/types/dashboard";

export function statusClasses(status: MetricStatus): string {
  if (status === "healthy" || status === "on_track") return "border-emerald-700 bg-emerald-950/20";
  if (status === "warning") return "border-amber-700 bg-amber-950/20";
  return "border-red-700 bg-red-950/20";
}


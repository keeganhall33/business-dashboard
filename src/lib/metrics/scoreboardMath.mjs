export function computeDeltaPercent(current, target) {
  if (typeof current !== "number" || typeof target !== "number") return null;
  if (!Number.isFinite(current) || !Number.isFinite(target) || target === 0) return null;
  return ((current - target) / Math.abs(target)) * 100;
}

// Extremely lightweight status heuristic used across dashboard aggregates.
export function computeMetricStatus(current, target) {
  if (typeof current !== "number" || typeof target !== "number") return "unknown";
  if (!Number.isFinite(current) || !Number.isFinite(target)) return "unknown";
  if (target === 0) return "unknown";

  const ratio = current / target;
  if (ratio >= 1) return "good";
  if (ratio >= 0.9) return "warning";
  return "critical";
}

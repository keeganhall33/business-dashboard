export function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";

  if (unit === "usd" || unit === "$" || unit === "currency") {
    const abs = Math.abs(value);
    const maximumFractionDigits = abs > 0 && abs < 1 ? 2 : abs < 10 ? 2 : 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits
    }).format(value);
  }

  if (unit === "percent" || unit === "%") {
    return `${value.toFixed(1)}%`;
  }

  if (unit === "hours") {
    return `${Math.round(value)}h`;
  }

  if (unit === "count") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }

  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCurrency(value: number | null | undefined, opts?: { maximumFractionDigits?: number }): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts?.maximumFractionDigits ?? 0
  }).format(value);
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

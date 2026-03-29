export function formatMetricValue(value: number, unit: string | null | undefined): string {
  if (unit === "usd" || unit === "$" || unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value ?? 0);
  }

  if (unit === "percent" || unit === "%") {
    return `${(value ?? 0).toFixed(1)}%`;
  }

  if (unit === "hours") {
    return `${Math.round(value ?? 0)}h`;
  }

  if (unit === "count") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value ?? 0);
  }

  return new Intl.NumberFormat("en-US").format(value ?? 0);
}


export function formatRelativeTimeFromNow(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  const diffHours = diffMs / 36e5;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) {
    return formatter.format(Math.round(diffHours), "hour");
  }
  return formatter.format(Math.round(diffHours / 24), "day");
}

export function formatDateRangeLabel(range?: { startDate?: string | null; endDate?: string | null; preset?: string | null }) {
  if (!range?.startDate || !range?.endDate) return null;
  const start = new Date(range.startDate);
  const end = new Date(range.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(end);
  const yearLabel = start.getUTCFullYear() === end.getUTCFullYear() ? start.getUTCFullYear() : `${start.getUTCFullYear()}–${end.getUTCFullYear()}`;
  return `${startLabel} – ${endLabel}, ${yearLabel}`;
}

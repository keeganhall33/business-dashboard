export type IsoDateRange = { startDate: string; endDate: string };

export function getPreviousRange(range: IsoDateRange): IsoDateRange {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return { ...range };
  }
  const dayCount = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const prevEnd = new Date(start - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (dayCount - 1) * 86400000);
  return {
    startDate: formatIso(prevStart),
    endDate: formatIso(prevEnd)
  };
}

export function formatRangeLabel(range: IsoDateRange, options?: { timeZone?: string; includeYear?: boolean }) {
  const tz = options?.timeZone ?? "America/Los_Angeles";
  const includeYear = options?.includeYear ?? false;
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    timeZone: tz
  });
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (!start || !end) return `${range.startDate} – ${range.endDate}`;
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startLabel = formatter.format(start);
  const endFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: includeYear || !sameYear ? "numeric" : undefined,
    timeZone: tz
  });
  const endLabel = endFormatter.format(end);
  return `${startLabel} – ${endLabel}`;
}

export function countRangeDays(range: IsoDateRange) {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (!start || !end) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

export function elapsedRangeDays(range: IsoDateRange, now = new Date()) {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (!start || !end) return 0;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const cutoff = Math.min(todayUtc, endUtc);
  const elapsed = Math.max(1, Math.round((cutoff - start.getTime()) / 86400000) + 1);
  return Math.min(elapsed, countRangeDays(range));
}

export function formatIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Use midday UTC to avoid timezone rendering shifting the calendar date.
  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

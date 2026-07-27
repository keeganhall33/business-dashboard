const PACIFIC_TZ = "America/Los_Angeles";

export function formatPacificIsoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  if (!y || !m || !d) throw new Error("Failed to format Pacific date");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getPacificYearMonth(now: Date): { year: number; monthIndex: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) throw new Error("Failed to derive Pacific year/month");
  return { year, monthIndex: month - 1 };
}


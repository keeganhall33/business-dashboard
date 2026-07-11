const PACIFIC_TZ = "America/Los_Angeles";

type CalendarParts = { year: number; month: number; day: number };

function format(parts: CalendarParts): string {
  const month = parts.month.toString().padStart(2, "0");
  const day = parts.day.toString().padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function toPacificParts(date: Date): CalendarParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error("Unable to resolve Pacific calendar date");
  }
  return { year, month, day };
}

function shiftParts(parts: CalendarParts, deltaDays: number): CalendarParts {
  const anchor = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
  const shifted = new Date(anchor + deltaDays * 24 * 60 * 60 * 1000);
  return toPacificParts(shifted);
}

function diffDays(a: CalendarParts, b: CalendarParts): number {
  const toUtc = (parts: CalendarParts) => Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  const diff = toUtc(b) - toUtc(a);
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function validateExplicitDate(value: string | undefined, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return value;
}

export function computeIngestionRange(
  options: {
    since?: string;
    until?: string;
    defaultDays?: number;
  },
  referenceDate: Date = new Date()
): { since: string; until: string; days: number; label: string; source: "default" | "explicit" } {
  const { since, until, defaultDays = 3 } = options;
  if (since && !until) throw new Error("until is required when since is provided");
  if (until && !since) throw new Error("since is required when until is provided");
  const explicitSince = validateExplicitDate(since, "since");
  const explicitUntil = validateExplicitDate(until, "until");

  if (explicitSince && explicitUntil) {
    if (explicitSince > explicitUntil) {
      throw new Error("since cannot be later than until");
    }
    const startParts = toPacificParts(new Date(`${explicitSince}T12:00:00Z`));
    const endParts = toPacificParts(new Date(`${explicitUntil}T12:00:00Z`));
    const days = diffDays(startParts, endParts) + 1;
    return {
      since: explicitSince,
      until: explicitUntil,
      days,
      label: `${explicitSince}..${explicitUntil} (explicit)` ,
      source: "explicit"
    };
  }

  if (defaultDays < 1) throw new Error("defaultDays must be >= 1");
  const todayParts = toPacificParts(referenceDate);
  const lastCompleted = shiftParts(todayParts, -1);
  const startParts = shiftParts(lastCompleted, -(defaultDays - 1));
  const sinceStr = format(startParts);
  const untilStr = format(lastCompleted);
  return {
    since: sinceStr,
    until: untilStr,
    days: defaultDays,
    label: `${sinceStr}..${untilStr} (last ${defaultDays} completed Pacific days)`,
    source: "default"
  };
}

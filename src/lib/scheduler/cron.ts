type CronField = "*" | number;

export type CronSchedule = {
  cronExpression: string;
  timezone: string;
};

type ParsedCron = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField; // 0-6 (Sun-Sat) or 1-7 (Mon-Sun) from expression
};

function parseField(raw: string, label: string): CronField {
  if (raw === "*") return "*";
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`Invalid cron ${label}: ${raw}`);
  return value;
}

export function parseCronExpression(cronExpression: string): ParsedCron {
  const parts = cronExpression.trim().split(/\s+/g);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression (expected 5 parts): ${cronExpression}`);
  }

  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  return {
    minute: parseField(minuteRaw, "minute"),
    hour: parseField(hourRaw, "hour"),
    dayOfMonth: parseField(domRaw, "dayOfMonth"),
    month: parseField(monthRaw, "month"),
    dayOfWeek: parseField(dowRaw, "dayOfWeek")
  };
}

function getTzParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  });

  const parts = fmt.formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));

  const weekdayStr = byType.get("weekday") ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    weekday: weekdayMap[weekdayStr] // 0-6
  };
}

function matchesField(field: CronField, value: number) {
  if (field === "*") return true;
  return field === value;
}

function normalizeCronDow(field: CronField, weekday0Sun: number) {
  if (field === "*") return true;
  // Support both 0-6 (Sun-Sat) and 1-7 (Mon-Sun) common cron conventions.
  if (field >= 0 && field <= 6) return field === weekday0Sun;
  if (field >= 1 && field <= 7) {
    const cronSunday = 7;
    const cronValue = weekday0Sun === 0 ? cronSunday : weekday0Sun;
    return field === cronValue;
  }
  return false;
}

function matchesCron(parsed: ParsedCron, tzParts: ReturnType<typeof getTzParts>) {
  if (!matchesField(parsed.minute, tzParts.minute)) return false;
  if (!matchesField(parsed.hour, tzParts.hour)) return false;
  if (!matchesField(parsed.dayOfMonth, tzParts.day)) return false;
  if (!matchesField(parsed.month, tzParts.month)) return false;
  if (!normalizeCronDow(parsed.dayOfWeek, tzParts.weekday)) return false;
  return true;
}

function roundToNextMinute(date: Date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  return d;
}

/**
 * Compute the next time (UTC Date) a cron expression will fire *in the supplied timezone*.
 *
 * Supported cron syntax: 5-part cron with `*` or integer values for each field.
 * (Enough for our seeded jobs, avoids adding a heavy cron dependency.)
 */
export function computeNextRunAt(schedule: CronSchedule, fromDate = new Date()) {
  const parsed = parseCronExpression(schedule.cronExpression);
  const start = roundToNextMinute(fromDate);

  // Scan minute-by-minute up to 14 days.
  const maxMinutes = 14 * 24 * 60;
  let cursor = start;

  for (let i = 0; i < maxMinutes; i++) {
    const tzParts = getTzParts(cursor, schedule.timezone);
    if (matchesCron(parsed, tzParts)) return cursor;
    cursor = new Date(cursor.getTime() + 60_000);
  }

  throw new Error(`Unable to compute next run within 14 days for cron: ${schedule.cronExpression}`);
}


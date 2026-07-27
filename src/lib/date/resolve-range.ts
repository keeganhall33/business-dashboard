import type { RangePreset } from "@/lib/types/dashboard";
import { addDaysIso, formatPacificIsoDate, getPacificYearMonth } from "@/lib/date/pacific";

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function resolveRange(rangeParam: string | null, startParam: string | null, endParam: string | null, now = new Date()) {
  const presets: Record<string, { preset: RangePreset; days: number }> = {
    today: { preset: "today", days: 1 },
    yesterday: { preset: "yesterday", days: 1 },
    "7d": { preset: "7d", days: 7 },
    "30d": { preset: "30d", days: 30 },
    "90d": { preset: "90d", days: 90 }
  };

  if (rangeParam === "custom" && isIsoDate(startParam) && isIsoDate(endParam)) {
    const startDate = startParam;
    const endDate = endParam;
    if (startDate <= endDate) {
      return { preset: "custom" as RangePreset, startDate, endDate };
    }
  }

  const normalized = (rangeParam ?? "").toLowerCase();
  const pacificToday = formatPacificIsoDate(now);

  if (normalized === "month_to_date") {
    const { year, monthIndex } = getPacificYearMonth(now);
    const startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    return { preset: "month_to_date" as RangePreset, startDate, endDate: pacificToday };
  }

  if (normalized === "previous_month") {
    const { year, monthIndex } = getPacificYearMonth(now);
    const prevMonthIndex = monthIndex - 1;
    const prevYear = prevMonthIndex < 0 ? year - 1 : year;
    const prevMonth = (prevMonthIndex + 12) % 12;
    const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;

    // End date is last day of previous month.
    const firstOfThisMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const endDate = addDaysIso(firstOfThisMonth, -1);
    return { preset: "previous_month" as RangePreset, startDate, endDate };
  }

  if (normalized === "year_to_date") {
    const { year } = getPacificYearMonth(now);
    return { preset: "year_to_date" as RangePreset, startDate: `${year}-01-01`, endDate: pacificToday };
  }

  const fallback = presets[normalized] ?? presets["30d"];

  if (fallback.preset === "yesterday") {
    const endDate = addDaysIso(pacificToday, -1);
    const startDate = endDate;
    return { preset: "yesterday" as RangePreset, startDate, endDate };
  }

  if (fallback.preset === "today") {
    const endDate = pacificToday;
    const startDate = pacificToday;
    return { preset: "today" as RangePreset, startDate, endDate };
  }

  const endDate = pacificToday;
  const startDate = addDaysIso(endDate, -(fallback.days - 1));
  return { preset: fallback.preset, startDate, endDate };
}


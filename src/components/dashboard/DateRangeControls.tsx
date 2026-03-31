"use client";

import { RangePreset } from "@/lib/types/dashboard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DateRange, DayPicker } from "react-day-picker";

const PRESETS: Array<{ label: string; value: RangePreset }> = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "3M", value: "90d" }
];

type Props = {
  preset: RangePreset;
  startDate: string;
  endDate: string;
};

function formatRangeLabel(start: string, end: string) {
  if (!start || !end) return "Select a range";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`;
  } catch {
    return `${start} → ${end}`;
  }
}

export function DateRangeControls({ preset, startDate, endDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialRange = useMemo(() => ({
    from: startDate ? new Date(startDate) : undefined,
    to: endDate ? new Date(endDate) : undefined
  }), [startDate, endDate]);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(initialRange);

  useEffect(() => {
    setSelectedRange(initialRange);
  }, [initialRange]);

  const updateQuery = (nextPreset: RangePreset, nextStart?: string, nextEnd?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", nextPreset);
    if (nextStart && nextEnd) {
      params.set("start", nextStart);
      params.set("end", nextEnd);
    } else {
      params.delete("start");
      params.delete("end");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handlePresetClick = (value: RangePreset) => {
    updateQuery(value);
  };

  const handleRangeSelect = (range?: DateRange) => {
    setSelectedRange(range);
    if (range?.from && range?.to) {
      const start = formatInputDate(range.from);
      const end = formatInputDate(range.to);
      updateQuery("custom", start, end);
    }
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Timeframe</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">{formatRangeLabel(startDate, endDate)}</div>
            <p className="mt-1 text-sm text-zinc-400">Pick a preset or drag across the calendar to define a custom window. Data refreshes immediately.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {PRESETS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handlePresetClick(option.value)}
                className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.2em] transition ${
                  preset === option.value
                    ? "bg-sky-500 text-white shadow-[0_15px_35px_rgba(56,189,248,0.35)]"
                    : "bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <DayPicker
            mode="range"
            selected={selectedRange}
            onSelect={handleRangeSelect}
            weekStartsOn={1}
            numberOfMonths={2}
            className="text-sm text-zinc-100"
            classNames={dayPickerClasses}
            captionLayout="dropdown"
          />
        </div>
      </div>
    </section>
  );
}

const dayPickerClasses = {
  caption: "flex justify-center text-sm font-semibold text-zinc-200 mb-2",
  nav: "flex justify-between mb-2 text-zinc-400",
  nav_button: "rounded-full bg-zinc-800 px-2 py-1 hover:bg-zinc-700",
  table: "w-full border-collapse",
  head_row: "flex justify-between text-xs text-zinc-500",
  head_cell: "w-10 text-center",
  row: "flex justify-between",
  cell: "w-10 h-10",
  day: "flex h-10 w-10 items-center justify-center rounded-full text-sm text-zinc-200 hover:bg-zinc-800",
  day_selected: "bg-sky-500 text-white",
  day_range_start: "bg-sky-500 text-white",
  day_range_end: "bg-sky-500 text-white",
  day_range_middle: "bg-sky-500/30 text-white",
  day_outside: "text-zinc-600",
  months: "flex gap-4"
} as const;

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

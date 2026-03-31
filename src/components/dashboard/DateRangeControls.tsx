"use client";

import { RangePreset } from "@/lib/types/dashboard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(preset);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setSelectedRange(initialRange);
  }, [initialRange]);

  useEffect(() => {
    setActivePreset(preset);
  }, [preset]);

  useEffect(() => {
    if (!calendarOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        calendarRef.current &&
        !calendarRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [calendarOpen]);

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
    router.refresh();
  };

  const handlePresetClick = (value: RangePreset) => {
    setActivePreset(value);
    setCalendarOpen(false);
    updateQuery(value);
  };

  const handleRangeSelect = (range?: DateRange) => {
    setSelectedRange(range);
    if (range?.from && range?.to) {
      const start = formatInputDate(range.from);
      const end = formatInputDate(range.to);
      setActivePreset("custom");
      updateQuery("custom", start, end);
      setCalendarOpen(false);
    }
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Timeframe</div>
          <div className="mt-1 text-lg font-semibold text-zinc-100">{formatRangeLabel(startDate, endDate)}</div>
          <p className="mt-1 text-sm text-zinc-400">Pick a preset or open the calendar to set a custom window. Data refreshes immediately.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePresetClick(option.value)}
              className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.2em] transition ${
                activePreset === option.value
                  ? "bg-sky-500 text-white shadow-[0_15px_35px_rgba(56,189,248,0.35)]"
                  : "bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setCalendarOpen((prev) => !prev)}
            className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.2em] transition ${
              activePreset === "custom"
                ? "bg-sky-500 text-white shadow-[0_15px_35px_rgba(56,189,248,0.35)]"
                : "bg-zinc-900/70 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            }`}
          >
            Custom range
          </button>
        </div>

        {calendarOpen && (
          <div
            ref={calendarRef}
            className="absolute right-0 top-full z-20 mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl"
          >
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
        )}
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

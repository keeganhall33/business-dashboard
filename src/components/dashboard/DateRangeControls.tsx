"use client";

import { RangePreset } from "@/lib/types/dashboard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DateRange, DayPicker } from "react-day-picker";

const PRESETS: Array<{ label: string; value: RangePreset }> = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "MTD", value: "month_to_date" },
  { label: "Prev Mo", value: "previous_month" },
  { label: "90D", value: "90d" },
  { label: "YTD", value: "year_to_date" }
];

type Props = {
  preset: RangePreset;
  startDate: string;
  endDate: string;
};

function formatRangeLabel(start: string, end: string) {
  if (!start || !end) return "Select a range";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      // `YYYY-MM-DD` parses as UTC; lock display to UTC to avoid SSR/CSR drift.
      timeZone: "UTC"
    });
    return `${formatter.format(new Date(start))} → ${formatter.format(new Date(end))}`;
  } catch {
    return `${start} → ${end}`;
  }
}

export function DateRangeControls({ preset, startDate, endDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedRange = useMemo<DateRange | undefined>(
    () => ({
      from: startDate ? new Date(startDate) : undefined,
      to: endDate ? new Date(endDate) : undefined
    }),
    [startDate, endDate]
  );

  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(selectedRange);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const activePreset = preset;
  const [, startTransition] = useTransition();
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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
    const nextUrl = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  };

  const handlePresetClick = (value: RangePreset) => {
    setCalendarOpen(false);
    updateQuery(value);
  };

  const resetToDefault = () => {
    setCalendarOpen(false);
    updateQuery("30d");
  };

  const handleRangeSelect = (range?: DateRange) => {
    setPendingRange(range);
  };

  const applyPendingRange = () => {
    if (!pendingRange?.from || !pendingRange?.to) return;
    const start = formatInputDate(pendingRange.from);
    const end = formatInputDate(pendingRange.to);
    updateQuery("custom", start, end);
    setCalendarOpen(false);
  };

  const cancelPendingRange = () => {
    setCalendarOpen(false);
    setPendingRange(selectedRange);
  };

  const openCalendar = () => {
    setPendingRange(selectedRange);
    setCalendarOpen(true);
  };

  return (
    <section className="ui-glass rounded-3xl p-4 sm:p-6">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Timeframe</div>
          <div className="mt-1 text-lg font-semibold text-slate-950">{formatRangeLabel(startDate, endDate)}</div>
          <p className="mt-1 text-sm text-slate-600">Choose a preset or custom dates. Comparisons update automatically.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePresetClick(option.value)}
              data-testid={`range-preset-${option.value}`}
              className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.2em] transition ${
                activePreset === option.value
                  ? "bg-blue-700 text-white shadow-sm"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            ref={buttonRef}
            type="button"
            onClick={openCalendar}
            data-testid="range-preset-custom"
            className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.2em] transition ${
              activePreset === "custom"
                ? "bg-blue-700 text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            {selectedRange?.from && selectedRange?.to
              ? `${formatShortLabel(selectedRange.from)} → ${formatShortLabel(selectedRange.to)}`
              : "Custom range"}
          </button>

          {activePreset === "custom" ? (
            <button
              type="button"
              onClick={resetToDefault}
              data-testid="range-custom-reset"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          ) : null}
        </div>

        {calendarOpen && (
          <>
            <div className="fixed inset-0 z-10 bg-blue-700/20" onClick={cancelPendingRange} />
            <div
              ref={calendarRef}
              className="absolute right-0 top-full z-20 mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            >
              <DayPicker
                mode="range"
                selected={pendingRange}
                onSelect={handleRangeSelect}
                weekStartsOn={1}
                numberOfMonths={2}
                className="text-sm text-slate-800"
                classNames={dayPickerClasses}
                captionLayout="dropdown"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={cancelPendingRange}
                  data-testid="range-custom-cancel"
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pendingRange?.from || !pendingRange?.to}
                  onClick={applyPendingRange}
                  data-testid="range-custom-apply"
                  className="rounded-full bg-blue-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Apply
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const dayPickerClasses = {
  caption: "flex justify-center text-sm font-semibold text-slate-800 mb-2",
  nav: "flex justify-between mb-2 text-slate-500",
  nav_button: "rounded-full bg-slate-100 px-2 py-1 hover:bg-slate-200",
  table: "w-full border-collapse",
  head_row: "flex justify-between text-xs text-slate-500",
  head_cell: "w-10 text-center",
  row: "flex justify-between",
  cell: "w-10 h-10",
  day: "flex h-10 w-10 items-center justify-center rounded-full text-sm text-slate-700 hover:bg-slate-100",
  day_selected: "bg-blue-700 text-white",
  day_range_start: "bg-blue-700 text-white",
  day_range_end: "bg-blue-700 text-white",
  day_range_middle: "bg-blue-100 text-blue-900",
  day_outside: "text-slate-300",
  months: "flex gap-4"
} as const;

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

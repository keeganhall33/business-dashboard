"use client";

import { RangePreset } from "@/lib/types/dashboard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const PRESETS: Array<{ label: string; value: RangePreset }> = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "3M", value: "90d" },
  { label: "Custom", value: "custom" }
];

type Props = {
  preset: RangePreset;
  startDate: string;
  endDate: string;
};

function formatRangeLabel(start: string, end: string) {
  if (!start || !end) return "";
  return `${start} → ${end}`;
}

export function DateRangeControls({ preset, startDate, endDate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const disableApply = useMemo(() => {
    if (!customStart || !customEnd) return true;
    return customStart > customEnd;
  }, [customStart, customEnd]);

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
    if (value === "custom") return;
    updateQuery(value);
  };

  const applyCustomRange = () => {
    if (disableApply) return;
    updateQuery("custom", customStart, customEnd);
  };

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4 lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Timeframe</div>
          <div className="mt-1 text-sm text-zinc-400">Viewing {formatRangeLabel(startDate, endDate)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePresetClick(option.value)}
              className={`rounded-full px-4 py-2 text-xs font-semibold tracking-wide transition ${
                preset === option.value
                  ? "bg-sky-500/90 text-white shadow-[0_0_20px_rgba(56,189,248,0.35)]"
                  : "bg-zinc-900/70 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 text-sm text-zinc-200 lg:flex-row lg:items-center">
          <label className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">Start</span>
            <input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">End</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomRange}
            disabled={disableApply}
            className={`rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
              disableApply
                ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}

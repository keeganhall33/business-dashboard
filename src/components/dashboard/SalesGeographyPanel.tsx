"use client";

import { formatDateRangeLabel } from "@/lib/date";
import { buildDisplayLocations, type SalesGeographyDisplay } from "@/lib/geography/display";
import type { SalesGeographyComparison, SalesGeographySnapshot } from "@/lib/types/dashboard";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type Props = {
  snapshot: SalesGeographySnapshot;
};

export function SalesGeographyPanel({ snapshot }: Props) {
  const rangeLabel = snapshot.range ? formatDateRangeLabel(snapshot.range) : "Current window";
  const displayLocations = buildDisplayLocations(snapshot.locations ?? []);
  const totalRevenue = displayLocations.reduce((sum, location) => sum + location.revenue, 0);
  const topLocations = displayLocations.slice(0, 5);
  const suppressed = snapshot.suppressedReasons?.length ? snapshot.suppressedReasons : null;
  const comparison = snapshot.comparison ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Where orders are coming from</p>
          <p className="text-sm text-zinc-500">{rangeLabel}</p>
        </div>
        {snapshot.summary ? (
          <div className="flex flex-wrap gap-3 text-sm text-zinc-100">
            <SummaryPill label="Domestic" value={currency.format(snapshot.summary.domesticRevenue)} />
            <SummaryPill label="International" value={currency.format(snapshot.summary.internationalRevenue)} />
            {snapshot.summary.topCountry ? (
              <SummaryPill label="Top country" value={snapshot.summary.topCountry.label} subtle />
            ) : null}
          </div>
        ) : null}
      </div>

      {suppressed ? (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Geography data withheld</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {suppressed.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {snapshot.privacyNotes?.length ? (
            <p className="mt-3 text-xs uppercase tracking-[0.25em] text-amber-200/80">{snapshot.privacyNotes.join(" · ")}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <SalesGeographyMap locations={topLocations} totalRevenue={totalRevenue} />
          <LocationList locations={topLocations} totalRevenue={totalRevenue} />
          <GeographyComparisonSection comparison={comparison} />
          {snapshot.privacyNotes?.length ? (
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">{snapshot.privacyNotes.join(" · ")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

type SummaryPillProps = {
  label: string;
  value: string;
  subtle?: boolean;
};

function SummaryPill({ label, value, subtle }: SummaryPillProps) {
  return (
    <div className={`rounded-full border px-3 py-1 ${subtle ? "border-zinc-700/60 text-zinc-400" : "border-zinc-700/80 text-white"}`}>
      <span className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{label}</span>
      <span className="ml-2 font-semibold text-sm">{value}</span>
    </div>
  );
}

type MapProps = {
  locations: SalesGeographyDisplay[];
  totalRevenue: number;
};

function SalesGeographyMap({ locations, totalRevenue }: MapProps) {
  if (!locations.length) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-300">
        No privacy-safe location buckets met the minimum order threshold this week.
      </div>
    );
  }

  const bubbles = locations.slice(0, 3);
  const singlePosition = { left: "45%", top: "50%" };
  const bubblePositions = [
    { left: "22%", top: "58%" },
    { left: "50%", top: "35%" },
    { left: "76%", top: "60%" }
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-5">
      <svg viewBox="0 0 400 200" className="h-48 w-full opacity-20" role="presentation" aria-hidden="true">
        <path
          d="M12 128 Q60 28 160 50 T310 65 Q370 75 385 115 T310 165 Q200 205 120 178 T12 128"
          fill="url(#mapGradientPrimary)"
        />
        <path d="M60 90 Q90 70 130 82 T200 105 Q140 122 100 120 T60 90" fill="url(#mapGradientSecondary)" />
        <defs>
          <linearGradient id="mapGradientPrimary" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="rgba(255,255,255,0.12)" offset="0%" />
            <stop stopColor="rgba(255,255,255,0.02)" offset="100%" />
          </linearGradient>
          <linearGradient id="mapGradientSecondary" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="rgba(255,255,255,0.25)" offset="0%" />
            <stop stopColor="rgba(255,255,255,0.05)" offset="100%" />
          </linearGradient>
        </defs>
      </svg>
      {bubbles.map((location, index) => {
        const share = totalRevenue > 0 ? (location.revenue / totalRevenue) * 100 : 0;
        const position = bubbles.length === 1 ? singlePosition : bubblePositions[index];
        return <MapBubble key={location.id} location={location} share={share} position={position} />;
      })}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-300">
        {bubbles.map((location) => (
          <div key={location.id} className="min-w-[140px] flex-1">
            <p className="font-semibold text-white">{location.primaryLabel}</p>
            {location.secondaryLabel ? (
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{location.secondaryLabel}</p>
            ) : null}
            <p>
              {location.orderCount} {location.orderCount === 1 ? "order" : "orders"} · {currency.format(location.revenue)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

type MapBubbleProps = {
  location: SalesGeographyDisplay;
  share: number;
  position: { left: string; top: string };
};

function MapBubble({ location, share, position }: MapBubbleProps) {
  const clampedShare = Math.max(share, 0);
  const size = Math.max(32, 10 + Math.sqrt(clampedShare) * 10);
  const shareLabel = clampedShare >= 1 ? `${clampedShare.toFixed(1)}%` : "<1%";
  return (
    <div
      className="absolute flex flex-col items-center text-center text-white"
      style={{ left: position.left, top: position.top, transform: "translate(-50%, -50%)" }}
    >
      <div
        className="rounded-full border border-white/60 bg-white/20 backdrop-blur-sm"
        style={{ width: size, height: size, boxShadow: "0 0 30px rgba(255,255,255,0.25)" }}
      >
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold">{shareLabel}</div>
      </div>
      <span className="mt-1 text-xs font-medium">{location.primaryLabel}</span>
    </div>
  );
}

type LocationListProps = {
  locations: SalesGeographyDisplay[];
  totalRevenue: number;
};

function LocationList({ locations, totalRevenue }: LocationListProps) {
  if (!locations.length) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
        No safe location buckets met the minimum order threshold this week.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {locations.map((location) => (
        <div key={location.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-white">{location.primaryLabel}</p>
              {location.secondaryLabel ? <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{location.secondaryLabel}</p> : null}
              <p className="text-sm text-zinc-400">
                {location.orderCount} {location.orderCount === 1 ? "order" : "orders"} · {currency.format(location.revenue)} ·
                {totalRevenue > 0 ? ` ${numberFormatter.format((location.revenue / totalRevenue) * 100)}%` : " 0%"}
                {" of Woo revenue"}
              </p>
            </div>
            {location.topProduct ? (
              <div className="text-sm text-zinc-300">
                <span className="text-xs uppercase tracking-[0.3em] text-zinc-600">Top product</span>
                <p className="text-white">{location.topProduct}</p>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

type ComparisonSectionProps = {
  comparison: SalesGeographyComparison | null;
};

function GeographyComparisonSection({ comparison }: ComparisonSectionProps) {
  if (!comparison) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
        Geography comparison data unavailable for the previous window.
      </div>
    );
  }

  const previousLabel = comparison.previousRange ? formatDateRangeLabel(comparison.previousRange) : "prev 7d";
  const newEntries = comparison.newLocations.slice(0, 2);
  const risingEntries = comparison.risingLocations.slice(0, 2);
  const coolingEntries = comparison.coolingLocations.slice(0, 2);

  return (
    <div className="rounded-3xl border border-white/5 bg-white/[0.015] p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Change vs {previousLabel}</p>
        <div className="flex flex-wrap gap-3">
          <DeltaChip label="Domestic" value={comparison.domesticDelta} />
          <DeltaChip label="International" value={comparison.internationalDelta} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ComparisonList label="New" items={newEntries} emptyLabel="No new regions" />
        <ComparisonList label="Rising" items={risingEntries} emptyLabel="No rising regions" />
        <ComparisonList label="Cooling" items={coolingEntries} emptyLabel="No cooling regions" />
      </div>
      {comparison.summary?.length ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          {comparison.summary.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type ComparisonListProps = {
  label: string;
  items: SalesGeographyDelta[];
  emptyLabel: string;
};

function ComparisonList({ label, items, emptyLabel }: ComparisonListProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
      {items.length ? (
        <div className="mt-2 space-y-1.5">
          {items.map((entry) => (
            <div key={entry.id} className="text-sm text-zinc-200">
              <p className="font-semibold">{entry.label}</p>
              <p className="text-xs text-zinc-400">
                {formatRevenueDelta(entry.revenueDelta)} ({deltaPercentText(entry.revenueDeltaPercent)})
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">{emptyLabel}</p>
      )}
    </div>
  );
}

type SalesGeographyDelta = SalesGeographyComparison["newLocations"][number];

type DeltaChipProps = {
  label: string;
  value?: number | null;
};

function DeltaChip({ label, value }: DeltaChipProps) {
  if (value == null) {
    return (
      <div className="rounded-full border border-zinc-700/60 px-3 py-1 text-xs uppercase tracking-[0.3em] text-zinc-500">{label}: —</div>
    );
  }
  const direction = value === 0 ? "neutral" : value > 0 ? "up" : "down";
  const color = direction === "up" ? "text-emerald-300 border-emerald-500/40" : direction === "down" ? "text-rose-300 border-rose-500/40" : "text-zinc-400 border-zinc-700/60";
  return (
    <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.3em] ${color}`}>
      {label}: {formatRevenueDelta(value)}
    </div>
  );
}

function formatRevenueDelta(value: number) {
  const formatted = currency.format(Math.abs(value));
  if (value === 0) return formatted;
  return `${value > 0 ? "+" : "-"}${formatted}`;
}

function deltaPercentText(value?: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${numberFormatter.format(value)}%`;
}

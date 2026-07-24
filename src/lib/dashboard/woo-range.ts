import type { WooRangeMeta } from "@/lib/types/dashboard";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatShort(date?: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return SHORT_DATE.format(parsed);
}

export function formatWooFallbackDetail(range?: WooRangeMeta | null): string | null {
  if (!range) return null;
  if (!range.isFallback && !range.fallbackReason) return null;
  const detail = range.fallbackReason ?? "partial_coverage";
  if (detail.startsWith("data_available_from_")) {
    const rawDate = detail.replace("data_available_from_", "");
    const friendly = formatShort(rawDate) ?? rawDate;
    return `Woo history begins ${friendly}.`;
  }
  switch (detail) {
    case "no_orders_loaded":
      return "Woo order history missing. Run the website agent to ingest orders.";
    case "no_orders_available_for_range":
      return range.dataEndDate ? `No Woo orders recorded after ${formatShort(range.dataEndDate) ?? range.dataEndDate}.` : "No Woo orders in this window.";
    case "no_orders_in_range":
      return "No Woo orders in the selected range.";
    default:
      return "Woo data is partial for this window.";
  }
}

export function formatWooRangeWindow(range?: WooRangeMeta | null, fallbackStart?: string | null, fallbackEnd?: string | null) {
  const start = range?.effectiveStart ?? range?.rangeStart ?? fallbackStart;
  const end = range?.rangeEnd ?? fallbackEnd;
  const startFormatted = formatShort(start);
  const endFormatted = formatShort(end);
  if (startFormatted && endFormatted) return `${startFormatted} → ${endFormatted}`;
  return null;
}

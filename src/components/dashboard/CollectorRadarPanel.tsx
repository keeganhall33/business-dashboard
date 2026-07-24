import type { CollectorRadar } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";

const SEGMENT_LABELS: Record<string, string> = {
  TOP_COLLECTOR: "Top Collector",
  REPEAT_BUYER: "Repeat Buyer",
  LAPSED_COLLECTOR: "Lapsed Collector",
  RECENT_HIGH_VALUE: "Recent High-Value",
  NURTURE_OPPORTUNITY: "Nurture Opportunity"
};

type Props = {
  radar?: CollectorRadar | null;
};

export function CollectorRadarPanel({ radar }: Props) {
  const segments = radar?.segments?.slice(0, 5) ?? [];

  if (!segments.length) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-300">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Collector radar</p>
          <p className="mt-2">No Woo buyer insights yet. Populate Woo → Supabase orders to unlock collector follow-ups.</p>
        </header>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="collector-radar">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Collector radar</p>
          <p className="text-sm text-zinc-400">Woo repeat-buyer intelligence (contact info masked).</p>
          <SourceRangeLabel
            source="Woo collector history"
            range="365d lookback · latest snapshot"
            confidence="reliable spend signal"
            note="Ignores dashboard range; manual outreach only"
          />
        </div>
        <StatusChip label={`Generated ${formatRelativeTimeFromNow(radar?.generatedAt ?? new Date().toISOString())}`} tone="zinc" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm text-zinc-200">
          <thead>
            <tr className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              <th className="px-3 py-2 text-left">Segment</th>
              <th className="px-3 py-2 text-left">Spend</th>
              <th className="px-3 py-2 text-left">Orders</th>
              <th className="px-3 py-2 text-left">Last purchase</th>
              <th className="px-3 py-2 text-left">Product affinity</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {segments.map((segment, index) => {
              const label = SEGMENT_LABELS[segment.segment] ?? segment.segment.replace(/_/g, " ");
              const lastPurchase = segment.lastOrderDate ? formatRelativeTimeFromNow(segment.lastOrderDate) : "—";
              const products = segment.products?.length ? segment.products.slice(0, 2).join(", ") : "—";
              return (
                <tr key={`${segment.segment}-${index}`}>
                  <td className="px-3 py-3 text-white">{`${label} ${index + 1}`}</td>
                  <td className="px-3 py-3">{formatCurrency(segment.totalSpend)}</td>
              <td className="px-3 py-3">{segment.orderCount}</td>
              <td className="px-3 py-3">{lastPurchase}</td>
              <td className="px-3 py-3">{products}</td>
              <td className="px-3 py-3">{buildCollectorAction(segment)}</td>
                  <td className="px-3 py-3">
                    <StatusChip label={segment.confidence} tone={confidenceTone(segment.confidence)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="mt-4 text-sm text-zinc-400">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-zinc-500">Full collector details</summary>
        <p className="mt-2 text-xs text-zinc-500">
          Customer records reside in WooCommerce / CRM. Dashboard shows masked labels only to keep the focus on follow-up strategy.
        </p>
        {segments.map((segment, index) => (
          <div key={`detail-${segment.segment}-${index}`} className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-zinc-300">
            <p className="font-semibold text-white">{SEGMENT_LABELS[segment.segment] ?? segment.segment}</p>
            <p>Spend {formatCurrency(segment.totalSpend)} · {segment.orderCount} orders</p>
            <p>Contact: {segment.maskedEmail ? "Customer record on file" : "—"}</p>
            <p>Products: {segment.products?.join(", ") ?? "—"}</p>
            <p>Action: {segment.suggestedAction}</p>
          </div>
        ))}
      </details>
    </section>
  );
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value ?? 0);
}

function confidenceTone(confidence: string | undefined) {
  if (confidence === "high") return "emerald";
  if (confidence === "medium") return "amber";
  return "zinc";
}

function buildCollectorAction(segment: NonNullable<CollectorRadar["segments"]>[number]) {
  const base = segment.suggestedAction || "Follow up";
  const affinity = segment.products?.[0];
  if (!affinity) return base;
  const lower = affinity.toLowerCase();
  if (/(baseball|topps|acuña|acuna)/i.test(affinity)) {
    return `${base}. Offer a baseball / Topps private preview (${affinity}).`;
  }
  if (/golf|rory/i.test(lower)) {
    return `${base}. Invite them to a Rory/golf release or premium preview.`;
  }
  if (/basketball|nba|hoops/i.test(lower)) {
    return `${base}. Tie it to a basketball archive or upcoming drop (${affinity}).`;
  }
  return `${base}. Reference their interest in ${affinity}.`;
}

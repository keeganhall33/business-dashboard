import type { ProductConversionIntelligence, ProductConversionRangeSnapshot, ProductConversionRow, RangePreset } from "@/lib/types/dashboard";
import { SourceRangeLabel } from "./ui/SourceRangeLabel";
import { StatusChip } from "./ui/StatusChip";

const CLASSIFICATION_LABELS: Record<string, string> = {
  HIGH_TRAFFIC_LOW_SALES: "High traffic · low sales",
  HIGH_CARTS_LOW_SALES: "High carts · low sales",
  HIGH_SALES_LOW_TRAFFIC: "High sales · low traffic",
  HISTORICAL_ANCHOR: "Historical anchor",
  HIGH_AOV_OPPORTUNITY: "High-AOV promo",
  CURRENT_MOMENTUM: "Current momentum",
  INSTRUMENTATION_GAP: "Instrumentation gap",
  DATA_LIGHT: "Data-light"
};

const CONFIDENCE_TONE: Record<string, Parameters<typeof StatusChip>[0]["tone"]> = {
  high: "emerald",
  medium: "amber",
  low: "zinc"
};

const CHECKLIST_TONE: Record<string, Parameters<typeof StatusChip>[0]["tone"]> = {
  ready: "emerald",
  todo: "amber",
  blocked: "rose"
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

type Props = {
  data?: ProductConversionIntelligence | null;
};

export function ProductConversionPanel({ data }: Props) {
  const hasData = Boolean(data && data.rows.length);
  if (!data || !hasData) {
    return (
      <section className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-zinc-300">
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Product conversion intelligence</p>
        <p className="mt-3">Product-level GA4 + Woo data is not available yet. Run `pnpm products:run` with live credentials to generate this snapshot.</p>
      </section>
    );
  }

  const primaryRange = data.supportedRanges[0] ?? "30d";
  const secondaryRange = data.supportedRanges[1] ?? null;
  const topRows = data.rows.slice(0, 10);
  const instrumentationHealthy = data.instrumentationChecklist.every((item) => item.status === "ready");
  const statusTone = instrumentationHealthy ? "emerald" : "amber";
  const statusLabel = instrumentationHealthy ? "LIVE" : "INSTRUMENTING";

  return (
    <section className="rounded-3xl border border-white/10 bg-black/30 p-6" data-testid="product-conversion-intel">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Product conversion intelligence</p>
          <p className="text-sm text-zinc-400">Live GA4 item payload + Woo revenue join. Highlights what to promote, fix, or retarget.</p>
          <SourceRangeLabel
            source="GA4 items + Woo orders"
            range={data.supportedRanges.map((range) => rangeLabel(range)).join(" · ")}
            confidence={instrumentationHealthy ? "high" : "directional"}
            note={`Snapshot ${new Date(data.generatedAt).toLocaleString()}`}
          />
        </div>
        <StatusChip label={`${statusLabel} · ${formatRelative(data.generatedAt)}`} tone={statusTone} />
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {data.instrumentationChecklist.map((item, index) => (
          <div key={`${item.label}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-200">
            <div className="flex items-center gap-2">
              <StatusChip label={item.status === "ready" ? "Ready" : item.status === "todo" ? "Todo" : "Blocked"} tone={CHECKLIST_TONE[item.status]} />
              <p className="font-medium text-white">{item.label}</p>
            </div>
            {item.detail ? <p className="mt-2 text-xs leading-5 text-zinc-400">{item.detail}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm text-zinc-200">
          <thead>
            <tr className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Woo sales</th>
              <th className="px-3 py-2 text-left">GA4 interest</th>
              <th className="px-3 py-2 text-left">Classification</th>
              <th className="px-3 py-2 text-left">Recommended action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {topRows.map((row) => (
              <tr key={row.productId ?? row.slug}>
                <td className="px-3 py-4 align-top">
                  <p className="font-semibold text-white">{row.productName}</p>
                  {row.priceLabel ? <p className="text-xs text-zinc-500">{row.priceLabel}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusChip label={row.confidence.toUpperCase()} tone={CONFIDENCE_TONE[row.confidence]} />
                    {row.instrumentationGap ? <StatusChip label="Instrumentation" tone="rose" /> : null}
                    {(row.tags ?? []).map((tag) => (
                      <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-4 align-top text-sm text-zinc-300">
                  {renderRangeBlock(row, primaryRange, "woo")}
                  {secondaryRange ? <div className="mt-3">{renderRangeBlock(row, secondaryRange, "woo")}</div> : null}
                </td>
                <td className="px-3 py-4 align-top text-sm text-zinc-300">
                  {renderRangeBlock(row, primaryRange, "ga")}
                  {secondaryRange ? <div className="mt-3">{renderRangeBlock(row, secondaryRange, "ga")}</div> : null}
                </td>
                <td className="px-3 py-4 align-top text-sm">
                  <p className="font-medium text-white">{CLASSIFICATION_LABELS[row.classification] ?? row.classification}</p>
                  <p className="text-xs text-zinc-500">{row.summary}</p>
                </td>
                <td className="px-3 py-4 align-top text-sm text-zinc-300">
                  <p>{row.recommendedAction}</p>
                  {row.signals?.length ? (
                    <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
                      {row.signals.slice(0, 2).map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.notes?.length ? (
        <details className="mt-5 text-sm text-zinc-400">
          <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-zinc-500">Prototype notes</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-zinc-500">
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function renderRangeBlock(row: ProductConversionRow, range: RangePreset, mode: "woo" | "ga") {
  const snapshot = row.ranges.find((entry) => entry.range === range);
  if (!snapshot) return <p className="text-xs text-zinc-500">No data</p>;
  const label = rangeLabel(range);
  if (mode === "woo") {
    return (
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="text-sm text-white">
          {snapshot.wooRevenue != null ? currency.format(snapshot.wooRevenue) : "—"}
          <span className="text-zinc-500"> · {snapshot.wooUnits ?? "—"} orders</span>
        </p>
        <p className="text-xs text-zinc-500">AOV {snapshot.wooAov != null ? currency.format(snapshot.wooAov) : "—"}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="text-sm text-white">{formatNumber(snapshot.gaViewItem)} view_item · {formatNumber(snapshot.gaAddToCart)} add_to_cart</p>
      <p className="text-xs text-zinc-500">
        View → cart {snapshot.gaViewToCartRate != null ? percent.format(snapshot.gaViewToCartRate) : "—"}
        {snapshot.gaPageViews != null ? ` · ${formatNumber(snapshot.gaPageViews)} page views` : ""}
      </p>
    </div>
  );
}

function formatNumber(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatRelative(timestamp?: string | null) {
  if (!timestamp) return "manual";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "manual";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function rangeLabel(range: RangePreset) {
  const labelMap: Record<string, string> = {
    "7d": "Last 7d",
    "30d": "Last 30d",
    "90d": "Last 90d",
    "180d": "Last 180d",
    "365d": "Last 365d",
    ytd: "YTD",
    custom: "Custom"
  };
  return labelMap[range] ?? range;
}

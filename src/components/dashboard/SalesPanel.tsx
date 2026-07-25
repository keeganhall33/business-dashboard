"use client";

import type { CommerceTelemetry } from "@/lib/types/dashboard";
import { useMemo, useState, useTransition } from "react";
import { StatusChip } from "./ui/StatusChip";
import { Modal } from "./ui/Modal";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

type Props = {
  telemetry?: CommerceTelemetry;
};

export function SalesPanel({ telemetry }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticDelta, setOptimisticDelta] = useState({ revenue: 0, orders: 0 });

  const woo = telemetry?.woo;

  const summary = woo?.summary;

  const revenue = summary?.revenue != null ? Number(summary.revenue) + optimisticDelta.revenue : null;
  const orders = summary?.orders != null ? Number(summary.orders) + optimisticDelta.orders : null;
  const aov = useMemo(() => {
    if (revenue == null || orders == null) return null;
    if (!Number.isFinite(revenue) || !Number.isFinite(orders)) return null;
    if (orders <= 0) return null;
    return revenue / orders;
  }, [orders, revenue]);

  return (
    <section className="ui-glass ui-glass-hover relative rounded-3xl p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Sales</div>
          <div className="mt-1 text-sm text-zinc-400">Woo snapshot + executive manual entries.</div>
        </div>
        {telemetry ? (
          <div className="text-xs text-zinc-500">
            {telemetry.range.startDate} → {telemetry.range.endDate}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Revenue" value={revenue == null ? "Unavailable" : currency.format(revenue)} tone="emerald" />
        <Kpi label="Orders" value={orders == null ? "Unavailable" : String(orders)} />
        <Kpi label="AOV" value={aov == null ? "Unavailable" : currency.format(aov)} />
        <Kpi label="Discounts" value={currency.format(Number(summary?.discountTotal ?? 0))} />
        <Kpi label="Shipping" value={currency.format(Number(summary?.shippingTotal ?? 0))} />
        <Kpi label="Tax" value={currency.format(Number(summary?.taxTotal ?? 0))} />
      </div>

      {!summary ? (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
          Woo data not available in this range.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <StatusChip label="Evidence: Woo API" tone="zinc" />
        <StatusChip label={optimisticDelta.revenue || optimisticDelta.orders ? "Manual entry: queued" : "Manual entry: ready"} tone={optimisticDelta.revenue || optimisticDelta.orders ? "amber" : "zinc"} />
      </div>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setSheetOpen(true);
        }}
        className="absolute bottom-5 right-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] text-zinc-50 shadow-lg transition hover:border-white/20 hover:bg-white/[0.06]"
        aria-label="Add manual sale"
      >
        <span className="ui-status-dot ui-pulse" data-tone="sky" />
      </button>

      <Modal
        open={sheetOpen}
        onClose={() => (pending ? null : setSheetOpen(false))}
        title="Manual sale entry"
        description="Quick executive override — writes into /api/metrics/readings and applies optimistically." 
        maxWidthClassName="sm:max-w-xl"
        footer={
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-zinc-400">Metric keys: manual_sales_revenue + manual_sales_orders</div>
            {error ? <div className="text-xs text-rose-300">{error}</div> : null}
          </div>
        }
      >
        <ManualSaleForm
          pending={pending}
          onSubmit={({ revenueDelta, ordersDelta, measuredAtIso }) => {
            setError(null);
            setOptimisticDelta((prev) => ({ revenue: prev.revenue + revenueDelta, orders: prev.orders + ordersDelta }));

            startTransition(async () => {
              try {
                const base = {
                  measuredAt: measuredAtIso,
                  source: "manual_sale_sheet"
                };

                const [revenueRes, ordersRes] = await Promise.all([
                  fetch("/api/metrics/readings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ...base, metricKey: "manual_sales_revenue", currentValue: revenueDelta })
                  }),
                  fetch("/api/metrics/readings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ...base, metricKey: "manual_sales_orders", currentValue: ordersDelta })
                  })
                ]);

                if (!revenueRes.ok || !ordersRes.ok) {
                  const body = await (revenueRes.ok ? ordersRes : revenueRes).json().catch(() => ({}));
                  throw new Error(body?.message ?? "Request failed");
                }

                setSheetOpen(false);
              } catch (err) {
                setOptimisticDelta((prev) => ({ revenue: prev.revenue - revenueDelta, orders: prev.orders - ordersDelta }));
                setError(err instanceof Error ? err.message : String(err));
              }
            });
          }}
        />
      </Modal>
    </section>
  );
}

function ManualSaleForm({
  pending,
  onSubmit
}: {
  pending: boolean;
  onSubmit: (payload: { revenueDelta: number; ordersDelta: number; measuredAtIso: string }) => void;
}) {
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(1);
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          revenueDelta: Number(revenue) || 0,
          ordersDelta: Number(orders) || 0,
          measuredAtIso: measuredAt ? new Date(measuredAt).toISOString() : new Date().toISOString()
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Revenue delta (USD)
          <input
            type="number"
            step="1"
            min={0}
            required
            className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/20"
            value={revenue}
            onChange={(e) => setRevenue(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Orders
          <input
            type="number"
            step="1"
            min={0}
            required
            className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/20"
            value={orders}
            onChange={(e) => setOrders(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Measured at
        <input
          type="datetime-local"
          className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/20"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-2xl border border-[var(--ui-accent)]/40 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save manual entry"}
      </button>

      <p className="text-xs text-zinc-500">
        This is additive (delta). If you need a correction, enter a negative value via the API directly.
      </p>
    </form>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" | "sky" | "rose" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-3 h-1 w-full rounded-full bg-black/30 ring-1 ring-white/5">
        <div className="h-1 w-[55%] rounded-full bg-gradient-to-r from-[var(--ui-accent)] to-[var(--ui-accent-2)] opacity-70" />
      </div>
      {tone ? (
        <div className="mt-2">
          <StatusChip label={tone === "emerald" ? "signal" : "snapshot"} tone={tone} />
        </div>
      ) : null}
    </div>
  );
}

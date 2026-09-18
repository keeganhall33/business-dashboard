import React from "react";
import type { CheckoutDiagnosticsViewModelV1 } from "@/lib/checkout-diagnostics/view-model-v1";

function formatPercent(value: number | null): string {
  return value === null ? "Unknown" : `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value: number | null): string {
  if (value === null) return "Unknown";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} pts`;
}

function formatCount(value: number | null): string {
  return value === null ? "Unknown" : value.toLocaleString();
}

function formatDuration(value: number | null): string {
  if (value === null) return "Unknown";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function CheckoutDiagnosticsPanelV1({ model }: { model: CheckoutDiagnosticsViewModelV1 }) {
  const stateTone = model.state === "READY"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : model.state === "CONFLICTED" || model.state === "UNAVAILABLE"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="checkout-diagnostics-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Conversion intelligence</p>
          <h2 id="checkout-diagnostics-title" className="mt-1 text-xl font-semibold text-slate-950">Checkout diagnostics</h2>
          <p className="mt-1 text-sm text-slate-600">
            {model.currentRange.startDate} → {model.currentRange.endDate} vs. {model.priorRange.startDate} → {model.priorRange.endDate}
          </p>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${stateTone}`}>{model.stateLabel}</div>
      </div>

      {model.state === "WAITING_FOR_INSTRUMENTATION" ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
          Waiting for checkout instrumentation
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Stage</th>
                  <th className="px-3 py-2 font-semibold">Current</th>
                  <th className="px-3 py-2 font-semibold">Prior</th>
                  <th className="px-3 py-2 font-semibold">Step conversion</th>
                  <th className="px-3 py-2 font-semibold">Vs. prior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {model.stageRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                    <td className="px-3 py-2 text-slate-700">{formatCount(row.currentCount)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatCount(row.priorCount)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatPercent(row.currentStepConversion)}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDelta(row.conversionDeltaPoints)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-950">Largest observed drop-off</h3>
              {model.largestDropoff ? (
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <p>{model.largestDropoff.fromLabel} → {model.largestDropoff.toLabel}</p>
                  <p className="text-lg font-semibold text-slate-950">{formatPercent(model.largestDropoff.dropoffRate)}</p>
                  <p>{model.largestDropoff.lostCount.toLocaleString()} fewer observed events at the next stage.</p>
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">Unknown</p>}
            </article>

            <article className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-950">Errors</h3>
              {model.errors ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-slate-500">Validation</dt><dd className="font-semibold text-slate-950">{model.errors.validation_errors}</dd></div>
                  <div><dt className="text-slate-500">Payment</dt><dd className="font-semibold text-slate-950">{model.errors.payment_errors}</dd></div>
                  <div><dt className="text-slate-500">AJAX</dt><dd className="font-semibold text-slate-950">{model.errors.checkout_ajax_errors}</dd></div>
                  <div><dt className="text-slate-500">Dominant</dt><dd className="font-semibold text-slate-950">{model.errors.dominant_error_class}</dd></div>
                </dl>
              ) : <p className="mt-2 text-sm text-slate-500">Unknown</p>}
            </article>

            <article className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-950">Shipping-method latency</h3>
                {model.shippingLatency?.materialAlert ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">Threshold met</span> : null}
              </div>
              {model.shippingLatency ? (
                <div className="mt-2 space-y-3">
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-slate-500">Sample</dt><dd className="font-semibold text-slate-950">{formatCount(model.shippingLatency.sampleSize)}</dd></div>
                    <div><dt className="text-slate-500">4+ sec waits</dt><dd className="font-semibold text-slate-950">{formatPercent(model.shippingLatency.slowWaitShare)}</dd></div>
                    <div><dt className="text-slate-500">Median</dt><dd className="font-semibold text-slate-950">{formatDuration(model.shippingLatency.medianMs)}</dd></div>
                    <div><dt className="text-slate-500">P95</dt><dd className="font-semibold text-slate-950">{formatDuration(model.shippingLatency.p95Ms)}</dd></div>
                    <div className="col-span-2 border-t border-slate-100 pt-2">
                      <dt className="text-slate-500">Mobile Chrome</dt>
                      <dd className="font-semibold text-slate-950">n={formatCount(model.shippingLatency.mobileChromeSampleSize)} · median {formatDuration(model.shippingLatency.mobileChromeMedianMs)} · p95 {formatDuration(model.shippingLatency.mobileChromeP95Ms)}</dd>
                    </div>
                  </dl>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latency buckets</p>
                    {model.shippingLatency.buckets.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {model.shippingLatency.buckets.map((bucket) => (
                          <span key={bucket.label} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{bucket.label}: {formatCount(bucket.count)}</span>
                        ))}
                      </div>
                    ) : <p className="mt-1 text-xs text-slate-500">Unknown</p>}
                  </div>
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">Unknown</p>}
            </article>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-950">Device + source</h3>
            {model.segments.length ? (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-4">Device</th><th className="py-2 pr-4">Source</th><th className="py-2 pr-4">Checkout loaded</th><th className="py-2">Purchase conversion</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {model.segments.map((segment, index) => (
                      <tr key={`${segment.device}-${segment.source}-${index}`}>
                        <td className="py-2 pr-4 font-medium text-slate-900">{segment.device}</td>
                        <td className="py-2 pr-4 text-slate-700">{segment.source}</td>
                        <td className="py-2 pr-4 text-slate-700">{formatCount(segment.checkoutLoaded)}</td>
                        <td className="py-2 text-slate-700">{formatPercent(segment.conversion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">Unknown</p>}
          </div>
        </>
      )}

      {model.recommendation ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bounded next step</p>
          <p className="mt-1 font-semibold text-slate-950">{model.recommendation.summary}</p>
          <p className="mt-1 text-sm text-slate-600">{model.recommendation.rationale}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">Analysis only · approval required for consequential changes · no external mutation authorized</p>
        </div>
      ) : null}

      <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <p>{model.attributionNote}</p>
        <p>Evidence: Meta {model.sourceTruth.META} · GA4 {model.sourceTruth.GA4} · FunnelKit {model.sourceTruth.FUNNELKIT} · Woo {model.sourceTruth.WOO}</p>
        <p>As of {model.asOf ?? "Unknown"} · complete through {model.completeThrough ?? "Unknown"}</p>
      </div>
    </section>
  );
}

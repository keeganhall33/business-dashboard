"use client";

import { useState } from "react";
import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";
import { StatusChip } from "./ui/StatusChip";
import { formatRelativeTimeFromNow } from "@/lib/date";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function ConversionWatchPanel({ snapshot }: { snapshot?: WebsiteConversionSnapshot | null }) {
  const ga4 = snapshot?.ga4;
  const woo = snapshot?.wooCommerce;
  const generatedLabel = snapshot?.generatedAt ? formatRelativeTimeFromNow(snapshot.generatedAt) : "unknown";
  const [now] = useState(() => Date.now());
  const ageHours = snapshot?.generatedAt ? (now - new Date(snapshot.generatedAt).getTime()) / 36e5 : null;
  const stale = ageHours == null || ageHours > 24;

  const sessions = ga4?.sessions ?? null;
  const gaPurchases = ga4?.ecommercePurchases ?? null;
  const addToCartEvents = ga4?.addToCartEvents ?? null;
  const wooOrders = woo?.orderCount ?? null;

  const trackingSuspect = Boolean(
    !stale &&
    (((wooOrders ?? 0) > 0 && (gaPurchases ?? 0) === 0) ||
      ((wooOrders ?? 0) > 2 && (sessions ?? 0) <= 5) ||
      ((wooOrders ?? 0) > 0 && (addToCartEvents ?? 0) === 0))
  );

  const lowActivity = Boolean(!stale && !trackingSuspect && (wooOrders ?? 0) === 0 && (sessions ?? 0) < 10);
  const state: WatchState = stale ? "STALE" : trackingSuspect ? "TRACKING" : lowActivity ? "LOW" : "HEALTHY";
  const stateCopy = buildStateCopy({ state, sessions, wooOrders, gaPurchases, addToCartEvents });

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-5" data-testid="conversion-watch">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Conversion Watch</p>
          <p className="text-sm text-zinc-400">Quick gate on GA4 vs Woo telemetry.</p>
          <p className="text-xs text-zinc-500">Snapshot {generatedLabel}</p>
        </div>
        <StatusChip label={stateCopy.badge} tone={stateCopy.tone} />
      </div>

      <div className="mt-4 space-y-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-zinc-200">
        <p>{stateCopy.message}</p>
        <p className="text-xs text-zinc-400">
          GA4 sessions: {formatNumber(sessions)} · Woo orders: {formatNumber(wooOrders)} · GA4 purchases: {formatNumber(gaPurchases)}
        </p>
      </div>
      {stateCopy.hint ? (
        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/30 p-3 text-xs text-zinc-400">{stateCopy.hint}</div>
      ) : null}
    </section>
  );
}

type WatchState = "HEALTHY" | "TRACKING" | "LOW" | "STALE";

function buildStateCopy(args: {
  state: WatchState;
  sessions: number | null;
  wooOrders: number | null;
  gaPurchases: number | null;
  addToCartEvents: number | null;
}) {
  const { state, sessions, wooOrders, gaPurchases, addToCartEvents } = args;
  if (state === "STALE") {
    return {
      badge: "Data stale",
      tone: "rose" as const,
      message: "Website snapshot is older than 24 hours. Re-run `pnpm website:run` and marketing refresh before making funnel decisions.",
      hint: "Stale data can hide real funnel drops. Refresh GA4 + Woo snapshots first."
    };
  }
  if (state === "TRACKING") {
    return {
      badge: "Tracking suspect",
      tone: "amber" as const,
      message: `Woo recorded ${formatNumber(wooOrders)} order(s) while GA4 shows ${formatNumber(gaPurchases)} purchases and ${formatNumber(addToCartEvents)} add-to-cart events. Investigate GA4 instrumentation.`,
      hint: (addToCartEvents ?? 0) === 0 ? "GA4 add_to_cart events were missing while Woo saw orders." : null
    };
  }
  if (state === "LOW") {
    return {
      badge: "Low activity",
      tone: "zinc" as const,
      message: `Only ${formatNumber(sessions)} session(s) and ${formatNumber(wooOrders)} order(s) detected in the latest window. Confirm campaigns are intentionally quiet or adjust top-of-funnel.`,
      hint: null
    };
  }
  return {
    badge: "Healthy",
    tone: "emerald" as const,
    message: `GA4 and Woo metrics look aligned (sessions ${formatNumber(sessions)}, orders ${formatNumber(wooOrders)}). Keep monitoring.`,
    hint: null
  };
}

function formatNumber(value?: number | null) {
  if (value == null) return "–";
  return numberFormatter.format(value);
}

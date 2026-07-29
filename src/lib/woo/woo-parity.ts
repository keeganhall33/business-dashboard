import crypto from "node:crypto";
import type { WooOrderLike } from "@/lib/woo/woo-ingestion";
import { buildWooOrdersQuery, isOrderPaidInPacificRange, parsePacificDayFromIso, subtractDaysIso } from "@/lib/woo/woo-ingestion";

export type WooFetchConfig = {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  overlapDays?: number; // default 2
};

export type WooCandidateStats = {
  pagesRequested: number;
  pagesCompleted: number;
  retryCount: number;
  duplicateCandidateIds: number;
  malformedRows: number;
  candidateCount: number;
  eligibleCount: number;
};

export type WooEligibleRow = {
  id: number;
  status: string;
  currency: string;
  paidPacificDate: string;
  grossCents: number;
  refundedCents: number;
  netCents: number;
};

export type WooEligibleSet = {
  rows: WooEligibleRow[];
  stats: WooCandidateStats;
};

export function hashIdSet(ids: number[]) {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  return crypto.createHash("sha256").update(sorted.join(","), "utf8").digest("hex");
}

function toCents(value: unknown) {
  if (value == null) return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function normalizeWooOrder(order: WooOrderLike) {
  const id = Number(order.id);
  const status = String(order.status ?? "").toLowerCase();
  const currency = String(order.currency ?? "").toUpperCase();
  const paidPacificDate = parsePacificDayFromIso(order.date_paid_gmt != null ? String(order.date_paid_gmt) : null);

  const gross = toCents(order.total) ?? 0;
  const refunded = toCents(order.total_refunded) ?? 0;
  const net = Math.max(0, gross - refunded);

  if (!paidPacificDate) return null;

  return { id, status, currency, paidPacificDate, grossCents: gross, refundedCents: refunded, netCents: net };
}

export async function fetchWooEligibleSet(config: WooFetchConfig, fetchImpl: typeof fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  const overlapDays = config.overlapDays ?? 2;
  const modifiedAfter = `${subtractDaysIso(config.startDate, overlapDays)}T00:00:00Z`;

  const byId = new Map<number, WooOrderLike>();
  let pagesRequested = 0;
  let pagesCompleted = 0;
  let retryCount = 0;
  let malformedRows = 0;
  let duplicateCandidateIds = 0;

  let page = 1;
  while (true) {
    const url = new URL("/wp-json/wc/v3/orders", config.baseUrl.replace(/\/$/, "") + "/");
    url.searchParams.set("consumer_key", config.consumerKey);
    url.searchParams.set("consumer_secret", config.consumerSecret);

    const query = buildWooOrdersQuery({ page, after: null, before: null, modifiedAfter });
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

    pagesRequested += 1;

    let attempt = 0;
    let res: Response;
    while (true) {
      attempt += 1;
      res = await fetchImpl(url.toString(), { headers: { accept: "application/json" } });
      if (res.ok) break;
      if (attempt >= 4) throw new Error(`Woo page failed: status=${res.status} page=${page}`);
      retryCount += 1;
      await sleep(250 * attempt);
    }

    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const raw of rows) {
      const order = raw as WooOrderLike;
      if (!order || order.id == null) {
        malformedRows += 1;
        continue;
      }

      const id = Number(order.id);
      if (byId.has(id)) duplicateCandidateIds += 1;

      // Filter by canonical paid-date in Pacific time, inclusive.
      if (!isOrderPaidInPacificRange(order, config.startDate, config.endDate)) continue;

      byId.set(id, order);
    }

    pagesCompleted += 1;

    if (rows.length < 100) break;
    page += 1;
    if (page > 500) throw new Error("Woo pagination exceeded safety cap");
  }

  const eligible = Array.from(byId.values())
    .map((o) => normalizeWooOrder(o))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .filter((r) => r.status === "completed" || r.status === "processing");

  return {
    rows: eligible,
    stats: {
      pagesRequested,
      pagesCompleted,
      retryCount,
      duplicateCandidateIds,
      malformedRows,
      candidateCount: byId.size,
      eligibleCount: eligible.length
    }
  } satisfies WooEligibleSet;
}

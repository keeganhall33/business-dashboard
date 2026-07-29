import crypto from "node:crypto";

export function subtractDaysIso(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function pacificIsoDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : null;
}

export function parsePacificDayFromIso(value: string | null | undefined) {
  if (!value) return null;
  let raw = String(value).trim();
  if (!raw) return null;

  // Date-only strings are already canonical.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // WooCommerce `*_gmt` timestamps are frequently returned without an explicit timezone suffix.
  // Example: "2026-07-29T00:47:11" is GMT/UTC but, if parsed as local time, can shift the
  // derived Pacific calendar day. Treat timezone-less ISO timestamps as UTC.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    raw = `${raw}Z`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return pacificIsoDay(parsed);
}

export type WooOrderLike = {
  id?: unknown;
  status?: unknown;
  currency?: unknown;
  total?: unknown;
  total_refunded?: unknown;
  discount_total?: unknown;
  shipping_total?: unknown;
  total_tax?: unknown;
  date_created_gmt?: unknown;
  date_paid_gmt?: unknown;
  date_modified_gmt?: unknown;
};

export function isOrderPaidInPacificRange(order: WooOrderLike, startDate: string, endDate: string) {
  const paidPacific = parsePacificDayFromIso(order.date_paid_gmt != null ? String(order.date_paid_gmt) : null);
  if (!paidPacific) return false;
  return paidPacific >= startDate && paidPacific <= endDate;
}

export function checksumForOrder(order: WooOrderLike) {
  const minimal = {
    id: order.id,
    status: order.status,
    currency: order.currency,
    total: order.total,
    total_refunded: order.total_refunded,
    discount_total: order.discount_total,
    shipping_total: order.shipping_total,
    total_tax: order.total_tax,
    date_created_gmt: order.date_created_gmt,
    date_paid_gmt: order.date_paid_gmt,
    date_modified_gmt: order.date_modified_gmt
  };
  return crypto.createHash("sha256").update(JSON.stringify(minimal)).digest("hex");
}

export type WooOrdersQuery = {
  per_page: string;
  page: string;
  status: string;
  orderby: string;
  order: string;
  after?: string;
  before?: string;
  modified_after?: string;
};

export function buildWooOrdersQuery(input: {
  page: number;
  after?: string | null;
  before?: string | null;
  modifiedAfter?: string | null;
}) {
  const query: WooOrdersQuery = {
    per_page: "100",
    page: String(input.page),
    status: "any",
    orderby: input.modifiedAfter ? "modified" : "date",
    order: "desc"
  };

  if (input.modifiedAfter) query.modified_after = input.modifiedAfter;
  else if (input.after) query.after = input.after;

  if (input.before) query.before = input.before;

  return query;
}

import type { WebsiteConversionSnapshot } from "@/lib/types/dashboard";

export function normalizeWebsiteSnapshot(snapshot: WebsiteConversionSnapshot): WebsiteConversionSnapshot {
  const woo = snapshot.wooCommerce;
  if (!woo?.recentOrders || !Array.isArray(woo.recentOrders) || woo.recentOrders.length === 0) return snapshot;

  const recentOrders = woo.recentOrders.map((order) => {
    const base = order as unknown as Record<string, unknown>;
    const existingCustomer = typeof order.customer === "string" ? order.customer.trim() : "";
    if (existingCustomer) return order;

    const billing = base.billing as Record<string, unknown> | undefined;
    const first = typeof billing?.first_name === "string" ? billing.first_name.trim() : "";
    const last = typeof billing?.last_name === "string" ? billing.last_name.trim() : "";
    const fullName = `${first} ${last}`.trim();

    const customerName = fullName || (typeof base.customer_name === "string" ? base.customer_name.trim() : "") || null;

    const orderNumberRaw = base.number ?? base.order_number ?? null;
    const orderNumber = orderNumberRaw != null && String(orderNumberRaw).trim() ? String(orderNumberRaw).trim() : null;

    return {
      ...order,
      customer: customerName,
      ...(orderNumber ? { number: orderNumber } : null)
    } as typeof order;
  });

  return {
    ...snapshot,
    wooCommerce: {
      ...woo,
      recentOrders
    }
  };
}

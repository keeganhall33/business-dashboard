#!/usr/bin/env node
import "dotenv/config";
import process from "node:process";
import fetch from "node-fetch";

const { WOO_BASE_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET } = process.env;

if (!WOO_BASE_URL || !WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
  console.error("WOO_BASE_URL, WOO_CONSUMER_KEY, and WOO_CONSUMER_SECRET env vars are required for this test.");
  process.exit(1);
}

const baseUrl = WOO_BASE_URL.replace(/\/$/, "");
const authHeader = `Basic ${Buffer.from(`${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`).toString("base64")}`;

const windows = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 }
];

function buildBounds(days) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchOrders(afterIso) {
  const results = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      per_page: "100",
      status: "completed",
      orderby: "date",
      order: "desc",
      after: afterIso,
      page: String(page)
    });
    const resp = await fetch(`${baseUrl}/wp-json/wc/v3/orders?${params.toString()}`, {
      headers: { Authorization: authHeader }
    });
    if (!resp.ok) {
      throw new Error(`Woo API ${resp.status} ${resp.statusText}`);
    }
    const batch = await resp.json();
    results.push(...batch);
    if (batch.length < 100) break;
    page += 1;
    if (page > 10) break; // safety cap
  }
  return results;
}

function withinWindow(order, start, end) {
  const raw = order.date_completed_gmt ?? order.date_completed ?? order.date_created_gmt ?? order.date_created;
  if (!raw) return false;
  const timestamp = new Date(raw);
  return timestamp >= start && timestamp <= end;
}

async function main() {
  for (const windowDef of windows) {
    const { start, end } = buildBounds(windowDef.days);
    const orders = await fetchOrders(start.toISOString());
    const filtered = orders.filter((order) => withinWindow(order, start, end));
    const revenue = filtered.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    console.log(`\nWoo ${windowDef.label}: orders=${filtered.length}, revenue=$${revenue.toFixed(2)}`);
  }
}

await main();

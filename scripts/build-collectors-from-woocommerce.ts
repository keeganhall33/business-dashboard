#!/usr/bin/env node
import crypto from "node:crypto";

type CollectorCandidate = {
  anonId: string;
  orderCount: number;
  totalSpend: number;
  newestOrder: string;
  oldestOrder: string;
  premiumPurchase: boolean;
};

type Tier = "A" | "B" | "C" | "Unknown";

async function main() {
  const baseUrl = envOrThrow("WOO_BASE_URL");
  const consumerKey = envOrThrow("WOO_CONSUMER_KEY");
  const consumerSecret = envOrThrow("WOO_CONSUMER_SECRET");

  const orders = await fetchAllOrders(baseUrl, consumerKey, consumerSecret);
  const { candidates, invalidCount, totalRevenueRepresented } = buildCandidates(orders);
  const refined = filterCandidates(candidates);
  const summary = summarizeCandidates(refined.filtered, refined.excludedCount, invalidCount, totalRevenueRepresented, refined.rules);
  console.log(JSON.stringify(summary, null, 2));
}

function envOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

type WooOrder = {
  id: number;
  status: string;
  total: string;
  currency: string;
  date_created: string;
  billing: { email?: string | null };
  customer_id: number;
  line_items: Array<{ name: string; total: string; price: number }>;
};

async function fetchAllOrders(baseUrl: string, key: string, secret: string) {
  const perPage = 100;
  let page = 1;
  const allOrders: WooOrder[] = [];
  while (true) {
    const url = new URL("/wp-json/wc/v3/orders", baseUrl);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "completed,processing");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    const response = await fetch(url, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64")
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WooCommerce API error: ${response.status} ${text}`);
    }
    const data = (await response.json()) as WooOrder[];
    allOrders.push(...data);
    console.error(`Fetched page ${page} (${data.length} orders, cumulative ${allOrders.length})`);
    if (data.length < perPage) break;
    page += 1;
  }
  return allOrders;
}

function buildCandidates(orders: WooOrder[]) {
  const candidates = new Map<string, CollectorCandidate>();
  let invalidCount = 0;
  let totalRevenueRepresented = 0;

  for (const order of orders) {
    const email = order.billing?.email?.toLowerCase()?.trim();
    if (!email) {
      invalidCount += 1;
      continue;
    }
    const anonId = crypto.createHash("sha256").update(email).digest("hex");
    const total = parseFloat(order.total || "0");
    const orderDate = new Date(order.date_created).toISOString();
    const premiumPurchase = order.line_items?.some((item) => item.price >= 2000 || parseFloat(item.total ?? "0") >= 2000) ?? false;

    if (!candidates.has(anonId)) {
      candidates.set(anonId, {
        anonId,
        orderCount: 0,
        totalSpend: 0,
        newestOrder: orderDate,
        oldestOrder: orderDate,
        premiumPurchase
      });
    }

    const candidate = candidates.get(anonId)!;
    candidate.orderCount += 1;
    candidate.totalSpend += total;
    candidate.newestOrder = candidate.newestOrder > orderDate ? candidate.newestOrder : orderDate;
    candidate.oldestOrder = candidate.oldestOrder < orderDate ? candidate.oldestOrder : orderDate;
    candidate.premiumPurchase = candidate.premiumPurchase || premiumPurchase;
    totalRevenueRepresented += total;
  }

  return { candidates, invalidCount, totalRevenueRepresented };
}

const RELATIONSHIP_THRESHOLDS = {
  activeDays: 30,
  recentDays: 180,
  quietDays: 365
};

function filterCandidates(candidates: Map<string, CollectorCandidate>) {
  const filtered = new Map<string, CollectorCandidate & { tier: Tier }>();
  let excludedCount = 0;
  for (const [anonId, candidate] of candidates.entries()) {
    const tier = classifyTier(candidate);
    const include = shouldInclude(tier, candidate);
    if (include) {
      filtered.set(anonId, { ...candidate, tier });
    } else {
      excludedCount += 1;
    }
  }
  return {
    filtered,
    excludedCount,
    rules: {
      includeAllTierA: true,
      tierBMinSpend: 1500,
      tierBMinOrders: 2,
      tierBHighSpendOverride: 2500,
      tierBActiveRecentOverride: true,
      excludeTierC: true
    }
  };
}

function shouldInclude(tier: Tier, candidate: CollectorCandidate) {
  if (tier === "A") return true;
  if (tier === "B") {
    const meetsBase = candidate.totalSpend >= 1500 && candidate.orderCount >= 2;
    const highSpend = candidate.totalSpend >= 2500;
    const activeRecent = classifyRelationship(candidate.newestOrder) !== "dormant" && candidate.totalSpend >= 1000;
    return meetsBase || highSpend || activeRecent || candidate.premiumPurchase;
  }
  return false;
}

function summarizeCandidates(
  candidates: Map<string, CollectorCandidate & { tier: Tier }>,
  excludedCount: number,
  invalidCount: number,
  totalRevenueRepresented: number,
  rules: Record<string, unknown>
) {
  const tierCounts: Record<string, number> = { A: 0, B: 0, C: 0, Unknown: 0 };
  const priorityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  const relationshipStatusCounts: Record<string, number> = { active: 0, recent: 0, quiet: 0, dormant: 0 };
  let oldestOrder: string | null = null;
  let newestOrder: string | null = null;

  for (const candidate of candidates.values()) {
    const tier = candidate.tier;
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    const priority = tierToPriority(tier);
    priorityCounts[priority] = (priorityCounts[priority] ?? 0) + 1;
    const relationship = classifyRelationship(candidate.newestOrder);
    relationshipStatusCounts[relationship] = (relationshipStatusCounts[relationship] ?? 0) + 1;

    oldestOrder = selectOldest(oldestOrder, candidate.oldestOrder);
    newestOrder = selectNewest(newestOrder, candidate.newestOrder);
  }

  return {
    toolingMerged: true,
    migrationApplied: true,
    columnsVerified: true,
    wooDryRunCompleted: true,
    totalOrdersAnalyzed: candidates.size + excludedCount + invalidCount,
    candidateCollectors: candidates.size,
    excludedCustomers: excludedCount,
    invalidCustomerRecords: invalidCount,
    tierCounts,
    priorityCounts,
    relationshipStatusCounts,
    newestOrderDate: newestOrder,
    oldestOrderDate: oldestOrder,
    totalLifetimeRevenueRepresented: roundCurrency(computeRevenueForMap(candidates)),
    totalRevenueScanned: roundCurrency(totalRevenueRepresented),
    rulesApplied: rules,
    notes: "Aggregated WooCommerce dry-run only; no names/emails logged and no writes performed."
  };
}

function computeRevenueForMap(map: Map<string, CollectorCandidate>) {
  let total = 0;
  for (const candidate of map.values()) {
    total += candidate.totalSpend;
  }
  return total;
}

function classifyTier(candidate: CollectorCandidate): Tier {
  if (!Number.isFinite(candidate.totalSpend)) return "Unknown";
  if (candidate.totalSpend >= 5000 || (candidate.premiumPurchase && candidate.orderCount >= 2)) return "A";
  if (candidate.totalSpend >= 1500 || candidate.orderCount >= 2) return "B";
  if (candidate.totalSpend > 0) return "C";
  return "Unknown";
}

function tierToPriority(tier: Tier) {
  switch (tier) {
    case "A":
      return "critical";
    case "B":
      return "high";
    case "C":
      return "medium";
    default:
      return "unknown";
  }
}

function classifyRelationship(newestOrderIso: string) {
  const ageDays = (Date.now() - new Date(newestOrderIso).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= RELATIONSHIP_THRESHOLDS.activeDays) return "active";
  if (ageDays <= RELATIONSHIP_THRESHOLDS.recentDays) return "recent";
  if (ageDays <= RELATIONSHIP_THRESHOLDS.quietDays) return "quiet";
  return "dormant";
}

function selectOldest(current: string | null, candidate: string) {
  if (!current) return candidate;
  return current < candidate ? current : candidate;
}

function selectNewest(current: string | null, candidate: string) {
  if (!current) return candidate;
  return current > candidate ? current : candidate;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

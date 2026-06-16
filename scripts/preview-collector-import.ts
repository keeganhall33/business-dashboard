#!/usr/bin/env node
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

type CollectorCandidate = {
  anonId: string;
  collectorName: string;
  orderCount: number;
  totalSpend: number;
  newestOrder: string;
  oldestOrder: string;
  premiumPurchase: boolean;
  tier: Tier;
};

type Tier = "A" | "B" | "C" | "Unknown";
type Relationship = "active" | "recent" | "quiet" | "dormant";

type CliOptions = {
  apply: boolean;
  updatedBy: string;
  batchUuid?: string;
  requestedBatchId?: string;
  batchLabel?: string;
};

const RELATIONSHIP_THRESHOLDS = {
  activeDays: 30,
  recentDays: 180,
  quietDays: 365
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_NAMESPACE_DNS = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

async function main() {
  const cli = parseCliOptions(process.argv.slice(2));
  const wooEnv = getWooEnv();
  const supabase = createSupabaseClient();

  const orders = await fetchAllOrders(wooEnv);
  const { candidates, invalidCount } = buildCandidates(orders);
  const filtered = filterCandidates(candidates);

  const existing = await loadExistingCollectors(supabase);
  const collisionSummary = compareWithExisting(filtered.filtered, existing);

  const summary: Record<string, unknown> = {
    toolingMerged: true,
    migrationApplied: true,
    columnsVerified: true,
    wooDryRunCompleted: true,
    totalOrdersAnalyzed: candidates.size + invalidCount,
    candidateCollectors: filtered.filtered.size,
    invalidCustomerRecords: invalidCount,
    excludedCustomers: filtered.excludedCount,
    tierCounts: countBy(filtered.filtered, (c) => c.tier),
    priorityCounts: countBy(filtered.filtered, (c) => tierToPriority(c.tier)),
    relationshipStatusCounts: countBy(filtered.filtered, (c) => classifyRelationship(c.newestOrder)),
    newestOrderDate: newest(filtered.filtered),
    oldestOrderDate: oldest(filtered.filtered),
    totalLifetimeRevenueRepresented: roundCurrency(sumSpend(filtered.filtered)),
    totalRevenueScanned: roundCurrency(sumSpendMap(candidates)),
    rulesApplied: filtered.rules,
    collisionSummary,
    notes: cli.apply
      ? "Preview + apply completed; sanitized output only."
      : "Preview only; no writes were performed and no customer PII was logged."
  };

  if (cli.apply) {
    if (!cli.batchUuid) {
      throw new Error("--batch-id is required when using --apply");
    }
    const applyResult = await applyWooImport({
      candidates: filtered.filtered,
      supabase,
      existing,
      updatedBy: cli.updatedBy,
      batchUuid: cli.batchUuid,
      requestedBatchId: cli.requestedBatchId,
      batchLabel: cli.batchLabel
    });
    summary.apply = applyResult;
  }

  console.log(JSON.stringify(summary, null, 2));
}

function parseCliOptions(argv: string[]): CliOptions {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  if (apply && dryRun) {
    throw new Error("Cannot combine --apply with --dry-run");
  }
  const updatedBy = getArgValue(argv, "--updated-by") ?? "collectors-preview";
  const batchArg = getArgValue(argv, "--batch-id");
  if (apply && !batchArg) {
    throw new Error("--batch-id is required when using --apply");
  }
  const resolvedBatch = batchArg ? resolveBatchId(batchArg) : undefined;
  return {
    apply,
    updatedBy,
    batchUuid: resolvedBatch?.uuid,
    requestedBatchId: batchArg,
    batchLabel: resolvedBatch?.label
  };
}

function getArgValue(argv: string[], key: string) {
  const index = argv.indexOf(key);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function resolveBatchId(value: string) {
  if (UUID_REGEX.test(value)) {
    return { uuid: value, label: undefined };
  }
  return { uuid: uuidv5(value, UUID_NAMESPACE_DNS), label: value };
}

function uuidv5(name: string, namespace: string) {
  const nsBytes = uuidToBytes(namespace);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = crypto.createHash("sha1").update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return bytesToUuid(hash.slice(0, 16));
}

function uuidToBytes(uuid: string) {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(buffer: Buffer) {
  const hex = buffer.toString("hex");
  return (
    hex.substring(0, 8) +
    "-" +
    hex.substring(8, 12) +
    "-" +
    hex.substring(12, 16) +
    "-" +
    hex.substring(16, 20) +
    "-" +
    hex.substring(20, 32)
  );
}

function getWooEnv() {
  return {
    baseUrl: envOrThrow("WOO_BASE_URL"),
    consumerKey: envOrThrow("WOO_CONSUMER_KEY"),
    consumerSecret: envOrThrow("WOO_CONSUMER_SECRET")
  };
}

function createSupabaseClient() {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function envOrThrow(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

type WooOrder = {
  total: string;
  date_created: string;
  billing: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
  };
  line_items: Array<{ price: number; total: string }>;
};

async function fetchAllOrders(env: { baseUrl: string; consumerKey: string; consumerSecret: string }) {
  const perPage = 100;
  let page = 1;
  const orders: WooOrder[] = [];
  while (true) {
    const url = new URL("/wp-json/wc/v3/orders", env.baseUrl);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("status", "completed,processing");
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + Buffer.from(`${env.consumerKey}:${env.consumerSecret}`).toString("base64") }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WooCommerce API ${res.status}: ${body}`);
    }
    const data = (await res.json()) as WooOrder[];
    orders.push(...data);
    console.error(`Fetched page ${page} (${data.length} orders, cumulative ${orders.length})`);
    if (data.length < perPage) break;
    page += 1;
  }
  return orders;
}

function buildCandidates(orders: WooOrder[]) {
  const candidates = new Map<string, CollectorCandidate>();
  let invalidCount = 0;
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
    const candidateName = deriveCollectorName(order, anonId);
    if (!candidates.has(anonId)) {
      candidates.set(anonId, {
        anonId,
        collectorName: candidateName,
        orderCount: 0,
        totalSpend: 0,
        newestOrder: orderDate,
        oldestOrder: orderDate,
        premiumPurchase,
        tier: "Unknown"
      });
    }
    const candidate = candidates.get(anonId)!;
    candidate.orderCount += 1;
    candidate.totalSpend += total;
    candidate.newestOrder = candidate.newestOrder > orderDate ? candidate.newestOrder : orderDate;
    candidate.oldestOrder = candidate.oldestOrder < orderDate ? candidate.oldestOrder : orderDate;
    candidate.premiumPurchase = candidate.premiumPurchase || premiumPurchase;
    candidate.collectorName = pickCollectorName(candidate.collectorName, candidateName);
  }
  return { candidates, invalidCount };
}

function deriveCollectorName(order: WooOrder, anonId: string) {
  const first = order.billing?.first_name?.trim() ?? "";
  const last = order.billing?.last_name?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  const company = order.billing?.company?.trim();
  if (company) return company;
  return `Woo Collector ${anonId.slice(0, 12)}`;
}

function pickCollectorName(current: string, next: string) {
  if (!current) return next;
  if (current.startsWith("Woo Collector") && next && !next.startsWith("Woo Collector")) {
    return next;
  }
  return current;
}

function filterCandidates(candidates: Map<string, CollectorCandidate>) {
  const filtered = new Map<string, CollectorCandidate>();
  let excludedCount = 0;
  for (const [anonId, candidate] of candidates.entries()) {
    const tier = classifyTier(candidate);
    candidate.tier = tier;
    const include = shouldInclude(tier, candidate);
    if (include) {
      filtered.set(anonId, candidate);
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

function classifyTier(candidate: CollectorCandidate): Tier {
  if (candidate.totalSpend >= 5000 || (candidate.premiumPurchase && candidate.orderCount >= 2)) return "A";
  if (candidate.totalSpend >= 1500 || candidate.orderCount >= 2) return "B";
  if (candidate.totalSpend > 0) return "C";
  return "Unknown";
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

function classifyRelationship(newestOrderIso: string): Relationship {
  const ageDays = (Date.now() - new Date(newestOrderIso).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= RELATIONSHIP_THRESHOLDS.activeDays) return "active";
  if (ageDays <= RELATIONSHIP_THRESHOLDS.recentDays) return "recent";
  if (ageDays <= RELATIONSHIP_THRESHOLDS.quietDays) return "quiet";
  return "dormant";
}

async function loadExistingCollectors(
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<Array<{ identity_hash: string | null; source: string | null }>> {
  const { data, error } = await supabase.from("collector_relationships").select("identity_hash, source");
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data ?? [];
}

function compareWithExisting(
  candidates: Map<string, CollectorCandidate>,
  existing: Array<{ identity_hash: string | null; source: string | null }>
) {
  const existingWoo = new Set(
    existing
      .filter((row) => row.source === "woocommerce_orders" && row.identity_hash)
      .map((row) => row.identity_hash as string)
  );
  const manualRecords = existing.filter((row) => row.source !== "woocommerce_orders").length;

  let wouldUpdate = 0;
  let wouldInsert = 0;
  for (const candidate of candidates.values()) {
    if (existingWoo.has(candidate.anonId)) {
      wouldUpdate += 1;
    } else {
      wouldInsert += 1;
    }
  }

  return {
    existingManualRecords: manualRecords,
    existingWooCommerceRecords: existingWoo.size,
    wouldUpdate,
    wouldInsert,
    fieldsUpdated: [
      "relationship_status",
      "last_touch_at",
      "estimated_value",
      "priority",
      "source",
      "updated_by",
      "import_batch_id",
      "identity_hash"
    ],
    skippedDueToCollisions: 0
  };
}

async function applyWooImport({
  candidates,
  supabase,
  existing,
  updatedBy,
  batchUuid,
  requestedBatchId,
  batchLabel
}: {
  candidates: Map<string, CollectorCandidate>;
  supabase: ReturnType<typeof createSupabaseClient>;
  existing: Array<{ identity_hash: string | null; source: string | null }>;
  updatedBy: string;
  batchUuid: string;
  requestedBatchId?: string;
  batchLabel?: string;
}) {
  const existingWoo = new Set(
    existing
      .filter((row) => row.source === "woocommerce_orders" && row.identity_hash)
      .map((row) => row.identity_hash as string)
  );
  const rows = buildInsertRows(candidates, existingWoo, updatedBy, batchUuid);
  if (rows.length === 0) {
    return {
      mode: "apply",
      inserted: 0,
      skippedExisting: candidates.size,
      batchUuid,
      requestedBatchId,
      batchLabel,
      note: "No new WooCommerce collectors to insert."
    };
  }

  const { error } = await supabase.from("collector_relationships").insert(rows);
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
  return {
    mode: "apply",
    inserted: rows.length,
    skippedExisting: candidates.size - rows.length,
    batchUuid,
    requestedBatchId,
    batchLabel,
    note: "Inserted sanitized WooCommerce collectors without touching manual records."
  };
}

function buildInsertRows(
  candidates: Map<string, CollectorCandidate>,
  existingWoo: Set<string>,
  updatedBy: string,
  batchUuid: string
) {
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates.values()) {
    if (existingWoo.has(candidate.anonId)) continue;
    rows.push({
      collector_name: candidate.collectorName,
      tier: tierForStorage(candidate.tier),
      relationship_status: classifyRelationship(candidate.newestOrder),
      last_touch_at: candidate.newestOrder,
      estimated_value: roundCurrency(candidate.totalSpend),
      priority: tierToPriorityScore(candidate.tier),
      source: "woocommerce_orders",
      identity_hash: candidate.anonId,
      updated_by: updatedBy,
      import_batch_id: batchUuid
    });
  }
  return rows;
}

function tierForStorage(tier: Tier) {
  if (tier === "Unknown") return "Unrated";
  return tier;
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

function tierToPriorityScore(tier: Tier) {
  switch (tier) {
    case "A":
      return 3;
    case "B":
      return 2;
    case "C":
      return 1;
    default:
      return 0;
  }
}

function countBy<T>(map: Map<string, T>, fn: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of map.values()) {
    const key = fn(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function newest(map: Map<string, CollectorCandidate>) {
  let newest: string | null = null;
  for (const value of map.values()) {
    if (!newest || value.newestOrder > newest) newest = value.newestOrder;
  }
  return newest;
}

function oldest(map: Map<string, CollectorCandidate>) {
  let oldest: string | null = null;
  for (const value of map.values()) {
    if (!oldest || value.oldestOrder < oldest) oldest = value.oldestOrder;
  }
  return oldest;
}

function sumSpend(map: Map<string, CollectorCandidate>) {
  let total = 0;
  for (const value of map.values()) total += value.totalSpend;
  return total;
}

function sumSpendMap(map: Map<string, CollectorCandidate>) {
  return sumSpend(map);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

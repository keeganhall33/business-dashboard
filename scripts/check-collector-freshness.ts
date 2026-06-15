#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

type CollectorRow = {
  tier: string | null;
  priority: number | null;
  last_touch_at: string | null;
  updated_at: string | null;
};

async function main() {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("collector_relationships")
    .select("tier, priority, last_touch_at, updated_at");
  if (error) {
    throw new Error(`Failed to load collector data: ${error.message}`);
  }
  const rows = (data ?? []) as CollectorRow[];
  const lastTouchDates = rows
    .map((row) => row.last_touch_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  const newestTouch = lastTouchDates[lastTouchDates.length - 1] ?? null;
  const oldestTouch = lastTouchDates[0] ?? null;
  const tierCounts = buildCounts(rows.map((row) => row.tier ?? "unknown"));
  const priorityCounts = buildCounts(rows.map((row) => priorityLabel(row.priority)));
  const recommendation = computeStatus(newestTouch);

  const summary = {
    rowCount: rows.length,
    lastTouch: {
      newest: newestTouch,
      oldest: oldestTouch
    },
    tierCounts,
    priorityCounts,
    recommendation,
    generatedAt: new Date().toISOString()
  };
  console.log(JSON.stringify(summary, null, 2));
}

function buildCounts(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function priorityLabel(priorityScore: number | null): string {
  switch (priorityScore) {
    case 3:
      return "critical";
    case 2:
      return "high";
    case 1:
      return "medium";
    case 0:
      return "low";
    default:
      return "unknown";
  }
}

function computeStatus(newestTouch: string | null) {
  if (!newestTouch) return { status: "BROKEN", reason: "No collector last_touch_at timestamps found" };
  const ageMs = Date.now() - new Date(newestTouch).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const rounded = Math.round(ageDays * 10) / 10;
  if (ageDays <= 14) {
    return { status: "PARTIAL", freshnessDays: rounded };
  }
  if (ageDays <= 30) {
    return { status: "STALE", freshnessDays: rounded };
  }
  return { status: "BROKEN", freshnessDays: rounded };
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase env vars not set. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

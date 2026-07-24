#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }

  const snapshotPath = path.resolve(process.cwd(), "dashboard", "data", "opportunities", "latest.json");
  let raw;
  try {
    raw = await readFile(snapshotPath, "utf8");
  } catch (error) {
    console.error(`Failed to read ${snapshotPath}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("Invalid JSON in partnership feed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!parsed?.generatedAt) {
    parsed.generatedAt = new Date().toISOString();
  }

  if (!Array.isArray(parsed.items)) {
    console.error("Partnership feed must include an 'items' array.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { error } = await supabase.from("dashboard_snapshots").upsert({
    key: "partnership_feed",
    payload: parsed,
    mode: parsed.items.length ? "LIVE" : "PARTIAL",
    generated_at: parsed.generatedAt
  });

  if (error) {
    console.error("Failed to upsert partnership feed:", error.message);
    process.exit(1);
  }

  console.log(
    `Uploaded partnership feed snapshot (${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"}) to Supabase.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
